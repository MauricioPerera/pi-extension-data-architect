/**
 * Agent discovery and configuration
 * v2.0.0 — hybrid: filesystem + js-doc-store-server registry
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project" | "registry";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

interface ServerAgentRecord {
	name: string;
	description: string;
	version?: string;
	tags?: string;
	model?: string;
	tools?: string;
	content: string;
	source?: string;
}

/* ── Server config loader ─────────────────────────────────────────────── */

function getSettingsPath(): string {
	const home = process.env.HOME || process.env.USERPROFILE || ".";
	return path.join(home, ".pi", "agent", "settings.json");
}

function loadServerConfig(): { url: string; token: string } | null {
	try {
		const raw = fs.readFileSync(getSettingsPath(), "utf-8");
		const cfg = JSON.parse(raw) as {
			dataArchitectApiUrl?: string;
			dataArchitectApiToken?: string;
		};
		if (cfg.dataArchitectApiUrl && cfg.dataArchitectApiToken) {
			return { url: cfg.dataArchitectApiUrl, token: cfg.dataArchitectApiToken };
		}
	} catch {
		/* ignore missing or malformed settings */
	}
	return null;
}

/* ── Server fetch ───────────────────────────────────────────────────────── */

async function loadAgentsFromServer(): Promise<AgentConfig[]> {
	const cfg = loadServerConfig();
	if (!cfg) return [];

	try {
		const res = await fetch(`${cfg.url}/admin/query`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${cfg.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tableName: "agents", filter: {} }),
		});

		if (!res.ok) {
			// Token might be expired — fallback silently; main agent handles auth
			return [];
		}

		const payload = (await res.json()) as { data?: ServerAgentRecord[]; error?: string };
		if (payload.error || !payload.data) return [];

		return payload.data
			.map((record): AgentConfig | null => {
				const content = record.content || "";
				const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

				if (!frontmatter.name || !frontmatter.description) {
					// Try to fall back to record fields if frontmatter is incomplete
					if (!record.name || !record.description) return null;
					const tools = record.tools
						?.split(",")
						.map((t) => t.trim())
						.filter(Boolean);
					return {
						name: record.name,
						description: record.description,
						tools: tools && tools.length > 0 ? tools : undefined,
						model: record.model,
						systemPrompt: content,
						source: "registry",
						filePath: `registry://${record.name}`,
					};
				}

				const tools = frontmatter.tools
					?.split(",")
					.map((t: string) => t.trim())
					.filter(Boolean);

				return {
					name: frontmatter.name,
					description: frontmatter.description,
					tools: tools && tools.length > 0 ? tools : undefined,
					model: frontmatter.model,
					systemPrompt: body,
					source: "registry",
					filePath: `registry://${frontmatter.name}`,
				};
			})
			.filter((a): a is AgentConfig => a !== null);
	} catch {
		return [];
	}
}

/* ── Filesystem loader ────────────────────────────────────────────────── */

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export async function discoverAgents(cwd: string, scope: AgentScope): Promise<AgentDiscoveryResult> {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	// Merge filesystem + server registry
	const serverAgents = await loadAgentsFromServer();

	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
		for (const agent of serverAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of serverAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
