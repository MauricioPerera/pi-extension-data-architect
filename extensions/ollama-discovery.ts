import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface OllamaModel {
	name: string;
	model: string;
	remote_model?: string;
	remote_host?: string;
	modified_at?: string;
	details?: {
		family?: string;
		families?: string[] | null;
		parameter_size?: string;
		quantization_level?: string;
	};
}

interface OllamaTagsResponse {
	models: OllamaModel[];
}

interface ExistingModelConfig {
	id: string;
	name?: string;
	reasoning?: boolean;
	thinkingLevelMap?: Record<string, string | null>;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	compat?: Record<string, unknown>;
	_launch?: boolean;
	[ key: string ]: unknown;
}

const DEFAULT_CONTEXT_WINDOW = 131072;

const FAMILY_KNOWLEDGE: Record<string, { reasoning: boolean; vision: boolean; contextWindow?: number }> = {
	qwen: { reasoning: true, vision: true, contextWindow: 131072 },
	qwen2: { reasoning: true, vision: true, contextWindow: 131072 },
	qwen25: { reasoning: true, vision: true, contextWindow: 131072 },
	qwen3: { reasoning: true, vision: true, contextWindow: 131072 },
	qwen3vl: { reasoning: true, vision: true, contextWindow: 131072 },
	qwen35moe: { reasoning: true, vision: true, contextWindow: 131072 },
	qwen3next: { reasoning: true, vision: true, contextWindow: 131072 },
	llama: { reasoning: false, vision: false, contextWindow: 131072 },
	llama3: { reasoning: false, vision: false, contextWindow: 131072 },
	mistral: { reasoning: false, vision: false, contextWindow: 131072 },
	mixtral: { reasoning: false, vision: false, contextWindow: 131072 },
	gemma: { reasoning: false, vision: true, contextWindow: 131072 },
	gemma3: { reasoning: false, vision: true, contextWindow: 131072 },
	gemma4: { reasoning: false, vision: true, contextWindow: 131072 },
	deepseek: { reasoning: true, vision: false, contextWindow: 131072 },
	kimi: { reasoning: true, vision: true, contextWindow: 262144 },
	"kimi-k2": { reasoning: true, vision: true, contextWindow: 262144 },
	granite: { reasoning: true, vision: false, contextWindow: 131072 },
	nemotron: { reasoning: true, vision: false, contextWindow: 131072 },
	"nemotron-super": { reasoning: true, vision: false, contextWindow: 131072 },
	phi: { reasoning: false, vision: false, contextWindow: 131072 },
	codestral: { reasoning: false, vision: false, contextWindow: 131072 },
	command: { reasoning: false, vision: false, contextWindow: 131072 },
	"command-r": { reasoning: false, vision: false, contextWindow: 131072 },
};

function getParamBillions(oml: OllamaModel): number {
	const ps = oml.details?.parameter_size ?? "";
	const match = ps.match(/([\d.]+)([ BKMT]?)/i);
	if (!match) return 0;
	const num = parseFloat(match[1]);
	const unit = match[2].toUpperCase();
	if (unit === "T") return num * 1000;
	if (unit === "B" || unit === "") return num;
	if (unit === "M") return num / 1000;
	if (unit === "K") return num / 1_000_000;
	return num;
}

function guessFromName(name: string) {
	const lower = name.toLowerCase();
	if (lower.includes("qwen3-vl")) return { reasoning: true, vision: true, contextWindow: 131072 };
	if (lower.includes("qwen3-coder-next")) return { reasoning: true, vision: false, contextWindow: 131072 };
	if (lower.includes("qwen3.6")) return { reasoning: true, vision: true, contextWindow: 131072 };
	if (lower.includes("qwen3")) return { reasoning: true, vision: true, contextWindow: 131072 };
	if (lower.includes("qwen2.5")) return { reasoning: true, vision: false, contextWindow: 131072 };
	if (lower.includes("qwen")) return { reasoning: true, vision: false, contextWindow: 131072 };
	if (lower.includes("llama3.2-vision")) return { reasoning: false, vision: true, contextWindow: 131072 };
	if (lower.includes("llama3")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("llama")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("mistral")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("mixtral")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("gemma4")) return { reasoning: false, vision: true, contextWindow: 131072 };
	if (lower.includes("gemma3")) return { reasoning: false, vision: true, contextWindow: 131072 };
	if (lower.includes("gemma")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("deepseek")) return { reasoning: true, vision: false, contextWindow: 131072 };
	if (lower.includes("kimi")) return { reasoning: true, vision: true, contextWindow: 262144 };
	if (lower.includes("granite")) return { reasoning: true, vision: false, contextWindow: 131072 };
	if (lower.includes("nemotron")) return { reasoning: true, vision: false, contextWindow: 131072 };
	if (lower.includes("phi")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("codestral")) return { reasoning: false, vision: false, contextWindow: 131072 };
	if (lower.includes("command")) return { reasoning: false, vision: false, contextWindow: 131072 };
	return null;
}

function buildModelConfig(oml: OllamaModel, existing?: ExistingModelConfig | undefined) {
	const nameLower = oml.name.toLowerCase();
	const family = (oml.details?.family ?? "").toLowerCase();
	const families = (oml.details?.families ?? []).map((f: string) => f.toLowerCase());
	const allFamilies = [family, ...families].filter(Boolean);
	const isCloud = !!oml.remote_host;
	const params = getParamBillions(oml);

	// 1. Try existing config first
	if (existing) {
		return {
			id: oml.name,
			name: existing.name ?? `${oml.name} ${isCloud ? "(Ollama Cloud)" : "(Local)"}`,
			reasoning: existing.reasoning ?? false,
			thinkingLevelMap: existing.thinkingLevelMap,
			input: existing.input ?? ["text"],
			contextWindow: existing.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
			maxTokens: existing.maxTokens ?? 16384,
			cost: existing.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			compat: existing.compat,
			_launch: existing._launch,
		};
	}

	// 2. Try family knowledge
	let guessed = null;
	for (const fam of allFamilies) {
		if (FAMILY_KNOWLEDGE[fam]) {
			guessed = FAMILY_KNOWLEDGE[fam];
			break;
		}
	}

	// 3. Try name-based fallback
	if (!guessed) {
		guessed = guessFromName(oml.name);
	}

	const reasoning = guessed?.reasoning ?? false;
	const vision = guessed?.vision ?? false;
	const ctxWindow = guessed?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;

	// Heuristics for maxTokens
	let maxTokens = 16384;
	if (reasoning && params >= 30) maxTokens = 32768;
	else if (reasoning && params >= 8) maxTokens = 16384;
	else if (!reasoning && params <= 8) maxTokens = 8192;

	// Default launch the biggest local reasoning model
	const isBiggestReasoningLocal = reasoning && !isCloud && params >= 20;

	return {
		id: oml.name,
		name: `${oml.name} ${isCloud ? "(Ollama Cloud)" : "(Local)"}`,
		reasoning,
		input: vision ? (["text", "image"] as string[]) : (["text"] as string[]),
		contextWindow: ctxWindow,
		maxTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		...(isBiggestReasoningLocal ? { _launch: true } : {}),
	};
}

export default async function (pi: ExtensionAPI) {
	const configDir = process.env.PI_CODING_AGENT_DIR || join(process.env.HOME || process.env.USERPROFILE || ".", ".pi", "agent");
	const modelsPath = join(configDir, "models.json");

	// 1. Load existing user overrides from models.json
	let existingModels = new Map<string, ExistingModelConfig>();
	let existingProviderConfig: { baseUrl?: string; apiKey?: string; compat?: Record<string, unknown> } = {};

	if (existsSync(modelsPath)) {
		try {
			const raw = JSON.parse(readFileSync(modelsPath, "utf-8")) as {
				providers?: Record<string, { models?: ExistingModelConfig[]; baseUrl?: string; apiKey?: string; compat?: Record<string, unknown> }>;
			};
			const ollama = raw.providers?.ollama;
			if (ollama) {
				existingProviderConfig = {
					baseUrl: ollama.baseUrl,
					apiKey: ollama.apiKey,
					compat: ollama.compat,
				};
				for (const m of ollama.models ?? []) {
					existingModels.set(m.id, m);
				}
			}
		} catch {
			// ignore parse errors, start fresh
		}
	}

	// 2. Discover Ollama models
	let discoveredModels: OllamaModel[] = [];
	try {
		const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
		if (res.ok) {
			const payload = (await res.json()) as OllamaTagsResponse;
			if (payload.models) {
				discoveredModels = payload.models;
			}
		}
	} catch {
		// Ollama not running or unreachable – use existing models.json or empty set
	}

	// 3. Build final model list: merge discovered + existing overrides
	const finalModels: Record<string, unknown>[] = [];
	const seen = new Set<string>();

	// Add discovered models first (prioritize what Ollama actually has)
	for (const oml of discoveredModels) {
		seen.add(oml.name);
		const existing = existingModels.get(oml.name);
		finalModels.push(buildModelConfig(oml, existing));
	}

	// Add existing models that might not be running but are still configured
	for (const [id, cfg] of existingModels) {
		if (!seen.has(id)) {
			seen.add(id);
			finalModels.push(cfg as Record<string, unknown>);
		}
	}

	// 4. Pick best default if no _launch set
	let hasLaunch = finalModels.some((m) => m._launch);
	if (!hasLaunch && finalModels.length > 0) {
		// Prefer: local + reasoning + biggest params
		let bestIdx = 0;
		for (let i = 0; i < finalModels.length; i++) {
			const cur = finalModels[i];
			const best = finalModels[bestIdx];
			if (cur._launch) {
				bestIdx = i;
				break;
			}
			const curLocal = !(cur.name as string).includes("Cloud");
			const bestLocal = !(best.name as string).includes("Cloud");
			const curReasoning = !!cur.reasoning;
			const bestReasoning = !!best.reasoning;
			if (curLocal && !bestLocal) bestIdx = i;
			else if (curLocal === bestLocal && curReasoning && !bestReasoning) bestIdx = i;
		}
		finalModels[bestIdx]._launch = true;
	}

	// 5. Register provider
	pi.registerProvider("ollama", {
		baseUrl: existingProviderConfig.baseUrl ?? "http://127.0.0.1:11434/v1",
		api: "openai-completions",
		apiKey: existingProviderConfig.apiKey ?? "ollama",
		compat: existingProviderConfig.compat ?? {
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
		},
		models: finalModels as any,
	});
}
