import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface AgentFrontmatter {
	name: string;
	description: string;
	tools?: string;
	model?: string;
}

interface ServerConfig {
	url: string;
	token: string;
}

interface SyncResult {
	inserted: string[];
	updated: string[];
	unchanged: string[];
	errors: { name: string; error: string }[];
}

function loadServerConfig(): ServerConfig | null {
	try {
		const home = process.env.HOME || process.env.USERPROFILE || ".";
		const raw = fs.readFileSync(path.join(home, ".pi", "agent", "settings.json"), "utf-8");
		const cfg = JSON.parse(raw) as {
			dataArchitectApiUrl?: string;
			dataArchitectApiToken?: string;
		};
		if (cfg.dataArchitectApiUrl && cfg.dataArchitectApiToken) {
			return { url: cfg.dataArchitectApiUrl, token: cfg.dataArchitectApiToken };
		}
	} catch {
		/* ignore */
	}
	return null;
}

async function getExistingAgentNames(cfg: ServerConfig): Promise<Set<string>> {
	try {
		const res = await fetch(`${cfg.url}/admin/query`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${cfg.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tableName: "agents", filter: {} }),
		});
		if (!res.ok) return new Set();
		const payload = (await res.json()) as { data?: { name: string }[]; error?: string };
		if (payload.error || !payload.data) return new Set();
		return new Set(payload.data.map((d) => d.name));
	} catch {
		return new Set();
	}
}

async function upsertAgent(cfg: ServerConfig, name: string, data: Record<string, unknown>): Promise<"inserted" | "updated" | "error"> {
	try {
		// Check if exists
		const checkRes = await fetch(`${cfg.url}/admin/query`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${cfg.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tableName: "agents", filter: { name } }),
		});

		const checkPayload = (await checkRes.json()) as { data?: unknown[] };
		const exists = (checkPayload.data?.length ?? 0) > 0;

		if (exists) {
			const res = await fetch(`${cfg.url}/admin/update`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${cfg.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tableName: "agents",
					filter: { name },
					update: { $set: data },
				}),
			});
			return res.ok ? "updated" : "error";
		} else {
			const res = await fetch(`${cfg.url}/admin/insert`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${cfg.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tableName: "agents",
					data,
				}),
			});
			return res.ok ? "inserted" : "error";
		}
	} catch {
		return "error";
	}
}

function loadLocalAgents(agentsDir: string): Array<{ name: string; content: string; frontmatter: AgentFrontmatter; body: string }> {
	const agents: Array<{ name: string; content: string; frontmatter: AgentFrontmatter; body: string }> = [];
	if (!fs.existsSync(agentsDir)) return agents;

	const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(agentsDir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (!frontmatter.name || !frontmatter.description) continue;

		agents.push({
			name: frontmatter.name,
			content,
			frontmatter: {
				name: frontmatter.name,
				description: frontmatter.description,
				tools: frontmatter.tools,
				model: frontmatter.model,
			},
			body,
		});
	}
	return agents;
}

export default function syncAgentsExtension(pi: ExtensionAPI) {
	pi.registerCommand("sync-agents", {
		description: "Sync local agent definitions to js-doc-store-server registry",
		getArgumentCompletions: (_prefix) => {
			return [
				{ value: "--dry-run", label: "Preview changes without applying" },
				{ value: "--force", label: "Overwrite all server agents with local" },
			];
		},

		handler: async (args, ctx) => {
			const dryRun = args.includes("--dry-run");
			const force = args.includes("--force");

			// 1. Load server config
			const cfg = loadServerConfig();
			if (!cfg) {
				ctx.ui.notify("No server config found. Set dataArchitectApiUrl and dataArchitectApiToken in ~/.pi/agent/settings.json", "error");
				return;
			}

			// 2. Load local agents
			const home = process.env.HOME || process.env.USERPROFILE || ".";
			const agentsDir = path.join(home, ".pi", "agent", "agents");
			const localAgents = loadLocalAgents(agentsDir);

			if (localAgents.length === 0) {
				ctx.ui.notify("No local agents found in ~/.pi/agent/agents/", "warning");
				return;
			}

			// 3. Get existing server agents
			const existingNames = await getExistingAgentNames(cfg);
			const result: SyncResult = { inserted: [], updated: [], unchanged: [], errors: [] };

			// 4. Process each agent
			for (const agent of localAgents) {
				const data = {
					name: agent.name,
					description: agent.frontmatter.description,
					version: "1.0.0",
					tags: "subagent," + agent.name,
					model: agent.frontmatter.model || "",
					tools: agent.frontmatter.tools || "",
					content: agent.content,
					source: "registry",
				};

				if (dryRun) {
					if (existingNames.has(agent.name)) {
						result.updated.push(agent.name);
					} else {
						result.inserted.push(agent.name);
					}
					continue;
				}

				const status = await upsertAgent(cfg, agent.name, data);
				if (status === "inserted") result.inserted.push(agent.name);
				else if (status === "updated") result.updated.push(agent.name);
				else result.errors.push({ name: agent.name, error: "Server rejected the request" });
			}

			// 5. Handle orphaned server agents (force mode)
			if (force && !dryRun) {
				const localNames = new Set(localAgents.map((a) => a.name));
				const orphaned = Array.from(existingNames).filter((n) => !localNames.has(n));
				for (const name of orphaned) {
					try {
						await fetch(`${cfg.url}/admin/remove`, {
							method: "POST",
							headers: {
								Authorization: `Bearer ${cfg.token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ tableName: "agents", filter: { name } }),
						});
					} catch {
						/* ignore orphan cleanup errors */
					}
				}
			}

			// 6. Build report
			const lines: string[] = [];
			if (dryRun) lines.push("🔍 DRY RUN — no changes applied");
			lines.push(`Agents found locally: ${localAgents.length}`);
			if (result.inserted.length > 0) lines.push(`  ✅ Inserted: ${result.inserted.join(", ")}`);
			if (result.updated.length > 0) lines.push(`  🔄 Updated: ${result.updated.join(", ")}`);
			if (result.unchanged.length > 0) lines.push(`  ⏭  Unchanged: ${result.unchanged.join(", ")}`);
			if (result.errors.length > 0) {
				lines.push(`  ❌ Errors:`);
				for (const e of result.errors) lines.push(`     ${e.name}: ${e.error}`);
			}

			const report = lines.join("\n");

			if (result.errors.length > 0) {
				ctx.ui.notify(report, "error");
			} else if (result.inserted.length > 0 || result.updated.length > 0) {
				ctx.ui.notify(report, "success");
			} else {
				ctx.ui.notify(report, "info");
			}

			// Also return as tool result text so it's in the conversation
			return { content: [{ type: "text", text: report }] };
		},
	});
}
