import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { parseFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/* ── Config helpers ─────────────────────────────────────────────────────── */

interface ServerConfig {
	url: string;
	token: string;
}

function loadServerConfig(): ServerConfig | null {
	try {
		const home = process.env.HOME || process.env.USERPROFILE || ".";
		const raw = fs.readFileSync(path.join(home, ".pi", "agent", "settings.json"), "utf-8");
		const cfg = JSON.parse(raw) as { dataArchitectApiUrl?: string; dataArchitectApiToken?: string };
		if (cfg.dataArchitectApiUrl && cfg.dataArchitectApiToken) {
			return { url: cfg.dataArchitectApiUrl, token: cfg.dataArchitectApiToken };
		}
	} catch { /* ignore */ }
	return null;
}

/* ── Server API helpers ─────────────────────────────────────────────────── */

async function serverQuery(cfg: ServerConfig, tableName: string, filter: Record<string, unknown>, limit?: number) {
	const res = await fetch(`${cfg.url}/admin/query`, {
		method: "POST",
		headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ tableName, filter, limit }),
	});
	if (!res.ok) throw new Error(`Server error: ${res.status}`);
	return (await res.json()) as { data?: any[]; error?: string };
}

async function serverInsert(cfg: ServerConfig, tableName: string, data: Record<string, unknown>) {
	const res = await fetch(`${cfg.url}/admin/insert`, {
		method: "POST",
		headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ tableName, data }),
	});
	if (!res.ok) throw new Error(`Insert failed: ${res.status}`);
	return await res.json();
}

async function serverUpdate(cfg: ServerConfig, tableName: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
	const res = await fetch(`${cfg.url}/admin/update`, {
		method: "POST",
		headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ tableName, filter, update }),
	});
	if (!res.ok) throw new Error(`Update failed: ${res.status}`);
	return await res.json();
}

async function serverRemove(cfg: ServerConfig, tableName: string, filter: Record<string, unknown>) {
	const res = await fetch(`${cfg.url}/admin/remove`, {
		method: "POST",
		headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ tableName, filter }),
	});
	if (!res.ok) throw new Error(`Remove failed: ${res.status}`);
	return await res.json();
}

/* ── Agent resolution ─────────────────────────────────────────────────── */

interface AgentDef {
	name: string;
	content: string;
	model?: string;
	tools?: string[];
}

async function resolveAgent(cfg: ServerConfig | null, agentName: string): Promise<AgentDef | null> {
	// 1. Try server registry
	if (cfg) {
		try {
			const result = await serverQuery(cfg, "agents", { name: agentName }, 1);
			if (result.data && result.data.length > 0) {
				const r = result.data[0];
				return {
					name: r.name,
					content: r.content || "",
					model: r.model,
					tools: r.tools ? r.tools.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined,
				};
			}
		} catch { /* fallback */ }
	}

	// 2. Try filesystem
	const home = process.env.HOME || process.env.USERPROFILE || ".";
	const agentsDir = path.join(home, ".pi", "agent", "agents");
	const filePath = path.join(agentsDir, `${agentName}.md`);
	if (fs.existsSync(filePath)) {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const { frontmatter } = parseFrontmatter<Record<string, string>>(content);
			const tools = frontmatter.tools
				?.split(",")
				.map((t: string) => t.trim())
				.filter(Boolean);
			return {
				name: agentName,
				content,
				model: frontmatter.model,
				tools,
			};
		} catch { /* ignore parse errors */ }
	}

	return null;
}

/* ── Subagent execution (simplified spawn) ──────────────────────────────── */

function getPiInvocation(): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtual = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtual && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(execName)) {
		return { command: process.execPath, args: [] };
	}
	return { command: "pi", args: [] };
}

async function executeWithAgent(
	agent: AgentDef,
	taskDescription: string,
	taskInput: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<{ success: boolean; output: string; stderr: string; model?: string }> {
	const invocation = getPiInvocation();
	const args: string[] = [...invocation.args, "--mode", "json", "-p", "--no-session"];

	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	// Build full prompt: system prompt from agent + task context
	const systemPrompt = agent.content;
	const userPrompt = `Task: ${taskDescription}\n\nInput:\n${taskInput || "(no additional input)"}`;

	// Write system prompt to temp file if present
	let tmpPath: string | null = null;
	if (systemPrompt.trim()) {
		const tmpDir = await fs.promises.mkdtemp(path.join(require("os").tmpdir(), "pi-task-"));
		tmpPath = path.join(tmpDir, "agent-prompt.md");
		await fs.promises.writeFile(tmpPath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
		args.push("--append-system-prompt", tmpPath);
	}

	args.push(userPrompt);

	return new Promise((resolve) => {
		const proc = spawn(invocation.command, args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buffer = "";
		let stderr = "";
		let finalText = "";
		let modelUsed: string | undefined;
		let wasAborted = false;

		const processLine = (line: string) => {
			if (!line.trim()) return;
			let event: any;
			try { event = JSON.parse(line); } catch { return; }

			if (event.type === "message_end" && event.message) {
				const msg = event.message;
				if (msg.role === "assistant") {
					for (const part of msg.content) {
						if (part.type === "text") finalText = part.text;
					}
					if (msg.model) modelUsed = msg.model;
				}
			}
		};

		proc.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (buffer.trim()) processLine(buffer);
			if (tmpPath) {
				try { fs.unlinkSync(tmpPath); fs.rmdirSync(path.dirname(tmpPath)); } catch { /* ignore */ }
			}
			resolve({
				success: code === 0 && !wasAborted,
				output: finalText,
				stderr,
				model: modelUsed,
			});
		});

		if (signal) {
			const kill = () => { wasAborted = true; proc.kill("SIGTERM"); };
			if (signal.aborted) kill();
			else signal.addEventListener("abort", kill, { once: true });
		}
	});
}

/* ── Tool schema ───────────────────────────────────────────────────────── */

const TaskAction = Type.Union([
	Type.Literal("create"),
	Type.Literal("list"),
	Type.Literal("get"),
	Type.Literal("update"),
	Type.Literal("assign"),
	Type.Literal("execute"),
	Type.Literal("delete"),
]);

const TaskParams = Type.Object({
	action: TaskAction,
	id: Type.Optional(Type.String({ description: "Task ID (for get/update/assign/execute/delete)" })),
	title: Type.Optional(Type.String({ description: "Task title (for create/update)" })),
	description: Type.Optional(Type.String({ description: "Task description" })),
	priority: Type.Optional(Type.String({ description: "low | medium | high | critical" })),
	agent: Type.Optional(Type.String({ description: "Subagent name to assign (scout, planner, worker, reviewer, etc.)" })),
	agent_scope: Type.Optional(Type.String({ description: "user | project | both (for agent discovery)" })),
	input: Type.Optional(Type.String({ description: "Input data/context for the task" })),
	tags: Type.Optional(Type.String({ description: "Comma-separated tags" })),
	parent_id: Type.Optional(Type.String({ description: "Parent task ID for subtasks" })),
	status: Type.Optional(Type.String({ description: "pending | in_progress | completed | failed | cancelled" })),
	output: Type.Optional(Type.String({ description: "Task output/result (for update)" })),
	limit: Type.Optional(Type.Number({ description: "Max results for list", default: 20 })),
});

/* ── ID generator ───────────────────────────────────────────────────────── */

function makeId(): string {
	const t = Date.now().toString(36);
	const r = Math.random().toString(36).slice(2, 6);
	return `task-${t}-${r}`;
}

/* ── Extension entry ──────────────────────────────────────────────────── */

export default function taskManagerExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "task_manager",
		label: "Task Manager",
		description: [
			"Persistent task management system backed by js-doc-store-server.",
			"Create, list, assign, and execute tasks with subagents.",
			"Actions: create, list, get, update, assign, execute, delete.",
		].join(" "),
		parameters: TaskParams,

		async execute(_toolCallId, params, signal) {
			const cfg = loadServerConfig();
			if (!cfg) {
				return {
					content: [{ type: "text", text: "❌ No server config. Set dataArchitectApiUrl + dataArchitectApiToken in ~/.pi/agent/settings.json" }],
					isError: true,
				};
			}

			const now = new Date().toISOString();

			/* ── CREATE ─────────────────────────────────────────────────── */
			if (params.action === "create") {
				if (!params.title) {
					return { content: [{ type: "text", text: "❌ create requires title" }], isError: true };
				}
				const id = makeId();
				const data = {
					id,
					title: params.title,
					description: params.description || "",
					status: params.status || "pending",
					priority: params.priority || "medium",
					agent: params.agent || "",
					agent_scope: params.agent_scope || "user",
					input: params.input || "",
					output: "",
					tags: params.tags || "",
					parent_id: params.parent_id || "",
					conversation_id: "",
					error_message: "",
					attempts: 0,
					created_at: now,
					started_at: "",
					completed_at: "",
				};
				await serverInsert(cfg, "tasks", data);
				return {
					content: [{ type: "text", text: `✅ Task created: ${id}\nTitle: ${params.title}\nStatus: ${data.status}` }],
				};
			}

			/* ── LIST ───────────────────────────────────────────────────── */
			if (params.action === "list") {
				const filter: Record<string, unknown> = {};
				if (params.status) filter.status = params.status;
				if (params.priority) filter.priority = params.priority;
				if (params.agent) filter.agent = params.agent;
				if (params.tags) {
					const tagList = params.tags.split(",").map((t) => t.trim()).filter(Boolean);
					if (tagList.length === 1) filter.tags = { $regex: tagList[0] };
					else filter.$or = tagList.map((t) => ({ tags: { $regex: t } }));
				}
				if (params.parent_id) filter.parent_id = params.parent_id;

				const result = await serverQuery(cfg, "tasks", filter, params.limit || 20);
				const tasks = result.data || [];
				if (tasks.length === 0) {
					return { content: [{ type: "text", text: "📭 No tasks found." }] };
				}

				const lines = tasks.map((t: any) => {
					const icon = t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : t.status === "in_progress" ? "⏳" : "⏸";
					return `${icon} [${t.id}] ${t.title} | ${t.status} | agent: ${t.agent || "—"} | prio: ${t.priority}`;
				});
				return {
					content: [{ type: "text", text: `📋 Tasks (${tasks.length}):\n${lines.join("\n")}` }],
				};
			}

			/* ── GET ────────────────────────────────────────────────────── */
			if (params.action === "get") {
				if (!params.id) return { content: [{ type: "text", text: "❌ get requires id" }], isError: true };
				const result = await serverQuery(cfg, "tasks", { id: params.id }, 1);
				const task = result.data?.[0];
				if (!task) return { content: [{ type: "text", text: `❌ Task not found: ${params.id}` }], isError: true };

				const text = [
					`📌 Task: ${task.id}`,
					`Title: ${task.title}`,
					`Status: ${task.status}`,
					`Priority: ${task.priority}`,
					`Agent: ${task.agent || "—"}`,
					`Description: ${task.description || "—"}`,
					`Input: ${task.input || "—"}`,
					`Output: ${task.output ? task.output.slice(0, 500) + (task.output.length > 500 ? "..." : "") : "—"}`,
					`Created: ${task.created_at}`,
					`Started: ${task.started_at || "—"}`,
					`Completed: ${task.completed_at || "—"}`,
					`Attempts: ${task.attempts || 0}`,
					`Error: ${task.error_message || "—"}`,
				].join("\n");
				return { content: [{ type: "text", text }] };
			}

			/* ── UPDATE ──────────────────────────────────────────────────── */
			if (params.action === "update") {
				if (!params.id) return { content: [{ type: "text", text: "❌ update requires id" }], isError: true };
				const $set: Record<string, unknown> = {};
				if (params.title !== undefined) $set.title = params.title;
				if (params.description !== undefined) $set.description = params.description;
				if (params.status !== undefined) $set.status = params.status;
				if (params.priority !== undefined) $set.priority = params.priority;
				if (params.agent !== undefined) $set.agent = params.agent;
				if (params.input !== undefined) $set.input = params.input;
				if (params.output !== undefined) $set.output = params.output;
				if (params.tags !== undefined) $set.tags = params.tags;
				if (params.parent_id !== undefined) $set.parent_id = params.parent_id;

				await serverUpdate(cfg, "tasks", { id: params.id }, { $set });
				return { content: [{ type: "text", text: `📝 Task updated: ${params.id}` }] };
			}

			/* ── ASSIGN ───────────────────────────────────────────────────── */
			if (params.action === "assign") {
				if (!params.id || !params.agent) {
					return { content: [{ type: "text", text: "❌ assign requires id + agent" }], isError: true };
				}
				// Verify agent exists
				const agentDef = await resolveAgent(cfg, params.agent);
				if (!agentDef) {
					return {
						content: [{ type: "text", text: `❌ Agent "${params.agent}" not found in registry or filesystem.` }],
						isError: true,
					};
				}
				await serverUpdate(cfg, "tasks", { id: params.id }, {
					$set: {
						agent: params.agent,
						agent_scope: params.agent_scope || "user",
						status: "pending",
					},
				});
				return {
					content: [{ type: "text", text: `🎯 Task ${params.id} assigned to agent: ${params.agent}` }],
				};
			}

			/* ── EXECUTE ────────────────────────────────────────────────── */
			if (params.action === "execute") {
				if (!params.id) return { content: [{ type: "text", text: "❌ execute requires id" }], isError: true };

				// Load task
				const result = await serverQuery(cfg, "tasks", { id: params.id }, 1);
				const task = result.data?.[0];
				if (!task) return { content: [{ type: "text", text: `❌ Task not found: ${params.id}` }], isError: true };
				if (!task.agent) return { content: [{ type: "text", text: `❌ Task ${params.id} has no assigned agent. Use assign first.` }], isError: true };

				// Resolve agent
				const agentDef = await resolveAgent(cfg, task.agent);
				if (!agentDef) {
					return {
						content: [{ type: "text", text: `❌ Agent "${task.agent}" no longer available.` }],
						isError: true,
					};
				}

				// Mark in_progress
				await serverUpdate(cfg, "tasks", { id: params.id }, {
					$set: { status: "in_progress", started_at: new Date().toISOString() },
					$inc: { attempts: 1 },
				});

				// Execute
				const execResult = await executeWithAgent(
					agentDef,
					task.description,
					task.input,
					process.cwd(),
					signal,
				);

				// Save result
				if (execResult.success) {
					await serverUpdate(cfg, "tasks", { id: params.id }, {
						$set: {
							status: "completed",
							output: execResult.output,
							completed_at: new Date().toISOString(),
							error_message: "",
						},
					});
					return {
						content: [
							{ type: "text", text: `✅ Task ${params.id} completed via ${task.agent}\n\n${execResult.output.slice(0, 2000)}${execResult.output.length > 2000 ? "..." : ""}` },
						],
					};
				} else {
					await serverUpdate(cfg, "tasks", { id: params.id }, {
						$set: {
							status: "failed",
							error_message: execResult.stderr || "Execution failed",
							completed_at: new Date().toISOString(),
						},
					});
					return {
						content: [
							{ type: "text", text: `❌ Task ${params.id} failed\nError: ${execResult.stderr || "Unknown error"}` },
						],
						isError: true,
					};
				}
			}

			/* ── DELETE ──────────────────────────────────────────────────── */
			if (params.action === "delete") {
				if (!params.id) return { content: [{ type: "text", text: "❌ delete requires id" }], isError: true };
				await serverRemove(cfg, "tasks", { id: params.id });
				return { content: [{ type: "text", text: `🗑️ Task deleted: ${params.id}` }] };
			}

			return { content: [{ type: "text", text: `❌ Unknown action: ${params.action}` }], isError: true };
		},
	});

	/* ── /task slash command ──────────────────────────────────────────────── */
	pi.registerCommand("task", {
		description: "Quick task manager (create, list, execute). Type /task create <title> or /task list",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const sub = parts[0] || "list";

			if (sub === "list" || args.trim() === "") {
				const cfg = loadServerConfig();
				if (!cfg) { ctx.ui.notify("No server config", "error"); return; }
				const result = await serverQuery(cfg, "tasks", {}, 20);
				const tasks = result.data || [];
				if (tasks.length === 0) { ctx.ui.notify("No tasks", "info"); return; }
				const lines = tasks.map((t: any) => {
					const icon = t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : t.status === "in_progress" ? "⏳" : "⏸";
					return `${icon} [${t.id}] ${t.title} | ${t.status} | ${t.agent || "—"}`;
				});
				ctx.ui.notify(lines.join("\n"), "info");
			} else if (sub === "create" && parts[1]) {
				const title = parts.slice(1).join(" ");
				const cfg = loadServerConfig();
				if (!cfg) { ctx.ui.notify("No server config", "error"); return; }
				const id = makeId();
				await serverInsert(cfg, "tasks", {
					id,
					title,
					description: "",
					status: "pending",
					priority: "medium",
					agent: "",
					agent_scope: "user",
					input: "",
					output: "",
					tags: "",
					parent_id: "",
					conversation_id: "",
					error_message: "",
					attempts: 0,
					created_at: new Date().toISOString(),
					started_at: "",
					completed_at: "",
				});
				ctx.ui.notify(`Created: ${id} — ${title}`, "success");
			} else {
				ctx.ui.notify("Usage: /task list | /task create <title>", "warning");
			}
		},
	});
}
