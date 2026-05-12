---
name: agent-registry
version: 1.0.0
tags: agents,subagent,registry,discovery,dynamic,persistence,architecture
author: MauricioPerera
description: Dynamic agent registry via js-doc-store-server. Store, version, and discover subagent definitions in a database instead of static markdown files.
---

# Agent Registry — Dynamic Agent Discovery

This skill extends the subagent pattern with a **hybrid discovery model**: agents live both on the filesystem (`~/.pi/agent/agents/*.md`) and in a `js-doc-store-server` table. When a subagent task runs, pi discovers agents from **both sources** and merges them.

## Problem with Static Filesystem Agents

| Issue | Consequence |
|-------|-------------|
| Agents scattered across machines | No portability between workspaces |
| No versioning | Agent definitions evolve but files don't track it |
| No dynamic updates | Must restart pi to see new agents |
| No sharing | Can't reuse agent definitions across projects |

## The Registry Pattern

```
Filesystem (~/.pi/agent/agents/)
├── scout.md
├── planner.md
├── reviewer.md
└── worker.md

js-doc-store-server (localhost:3000)
└── table: agents
    ├── scout     → content: full markdown
    ├── planner   → content: full markdown
    ├── reviewer  → content: full markdown
    ├── worker    → content: full markdown
    └── custom    → user-defined agents
```

## Schema

```json
{
  "tableName": "agents",
  "columns": [
    { "name": "name",        "type": "text", "required": true },
    { "name": "description", "type": "text" },
    { "name": "version",     "type": "text" },
    { "name": "tags",        "type": "text" },
    { "name": "model",       "type": "text" },
    { "name": "tools",       "type": "text" },
    { "name": "content",     "type": "text", "required": true },
    { "name": "source",      "type": "text" }
  ]
}
```

## Agent Markdown Format

The `content` field stores the **complete markdown** including frontmatter:

```markdown
---
name: scout
description: Fast codebase reconnaissance
tools: read, grep, find, ls, bash
model: qwen3.6:latest
---

You are a scout. Quickly investigate a codebase and return structured findings...
```

## How Discovery Works

When the `subagent` tool executes:

1. **Filesystem scan** — loads `~/.pi/agent/agents/*.md` (user-level)
2. **Project scan** — loads `.pi/agents/*.md` (project-level, if scope allows)
3. **Server query** — `POST /admin/query { tableName: "agents", filter: {} }`
4. **Merge** — server agents overlay filesystem agents by name (server wins)

Server agents have `source: "registry"` and `filePath: "registry://{name}"`.

## Workflow: Register a New Agent

```typescript
// 1. Discover by topic (optional)
const results = await arch_query({
  tableName: "agents",
  filter: { tags: { $regex: "review" } }
});

// 2. Register new agent from conversation
await arch_insert({
  tableName: "agents",
  data: {
    name: "security-auditor",
    description: "Audits code for security vulnerabilities",
    version: "1.0.0",
    tags: "security,audit,subagent",
    model: "qwen3.6:latest",
    tools: "read, grep, find, ls, bash",
    content: `---\nname: security-auditor\n...\n---\n\nYou are a security auditor...`,
    source: "registry"
  }
});

// 3. Verify
const all = await arch_query({ tableName: "agents", filter: {} });
```

## Tool Combinations for Agent Management

| Task | Tool Sequence |
|------|---------------|
| **Discover by topic** | `arch_query` → filter `tags: { $regex: "topic" }` |
| **Load full agent** | `arch_query` → filter `name: "exact-name"` → read `.content` |
| **Register new agent** | `arch_insert` into `agents` table |
| **Update agent version** | `arch_update` with `$set: { version, content }` |
| **List all agents** | `arch_query` with empty filter |
| **Delete obsolete agent** | `arch_remove` with filter `{ name: "agent-name" }` |

## Server-Side Fallback

If the server is unreachable or the token is expired, discovery falls back silently to filesystem-only agents. No error is thrown — the subagent continues working with whatever agents are available.

## Benefits

| Benefit | Explanation |
|---------|-------------|
| **Cross-machine portability** | Agents follow your `js-doc-store-server` |
| **Versioning** | Field `version` tracks agent evolution |
| **Tag Search** | Find agents by topic, not just filename |
| **Cross-session persistence** | Agents survive pi restarts |
| **Easy Registration** | New agent = 1 `arch_insert` call |
| **Centralized Source** | Single `agents` table |
| **Hybrid Fallback** | Works with or without server |

## Migration from Filesystem to Registry

1. Keep `~/.pi/agent/agents/*.md` as local cache/fallback
2. Register agents in `js-doc-store-server` using `arch_insert`
3. Future sessions: pi loads from both sources, server takes priority

## See Also

- `skill-registry` — Dynamic skill discovery (same pattern)
- `memory-management` — Persist conversations to server
- `subagent` extension — Delegation to isolated agents
