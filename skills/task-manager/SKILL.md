---
name: task-manager
version: 1.0.0
tags: tasks,workflow,subagent,project-management,orchestration,crud
author: MauricioPerera
description: Persistent task management with subagent orchestration. Create tasks, assign to agents, track execution, and build workflows via js-doc-store-server.
---

# Task Manager — Persistent Task Orchestration

This skill introduces a **task management system** backed by `js-doc-store-server` that integrates with the subagent framework. Tasks are persistent objects that can be assigned to specific agents, executed in isolation, and tracked across sessions.

## Problem It Solves

| Problem | Solution |
|---------|----------|
| Ad-hoc subagent calls get lost | Tasks persist in `tasks` table |
| No visibility of what was delegated | Task list shows status, agent, result |
| No retry mechanism | Failed tasks can be re-executed |
| No batching | Parent/child tasks for complex workflows |
| No cross-session continuity | Server storage survives pi restarts |

## Schema

Table: `tasks`

| Field | Type | Description |
|-------|------|-------------|
| `id` | text | Unique task identifier |
| `title` | text | Short name |
| `description` | text | Detailed instructions |
| `status` | text | pending / in_progress / completed / failed / cancelled |
| `priority` | text | low / medium / high / critical |
| `agent` | text | Subagent name (scout, planner, worker, etc.) |
| `agent_scope` | text | user / project / both |
| `input` | text | Context/data passed to agent |
| `output` | text | Result from agent execution |
| `tags` | text | Comma-separated labels |
| `parent_id` | text | For subtasks |
| `conversation_id` | text | Link to persistent messages |
| `error_message` | text | If execution failed |
| `attempts` | number | Execution retries |
| `created_at` | text | ISO timestamp |
| `started_at` | text | ISO timestamp |
| `completed_at` | text | ISO timestamp |

## Tool: `task_manager`

```typescript
task_manager({
  action: "create",           // create | list | get | update | assign | execute | delete
  title: "Add auth middleware",
  description: "Implement JWT validation...",
  priority: "high",
  agent: "worker",
  input: "Current auth.ts is empty, see repo structure...",
  tags: "auth,security,sprint-3",
  parent_id: "task-parent-001"
})
```

### Actions

| Action | Required params | Description |
|--------|----------------|-------------|
| `create` | `title` | Creates pending task, returns ID |
| `list` | — | Lists tasks with optional filters |
| `get` | `id` | Full task details |
| `update` | `id` + fields | Modify title, status, output, etc. |
| `assign` | `id` + `agent` | Bind agent, validates agent exists |
| `execute` | `id` | Spawns subagent, saves result, updates status |
| `delete` | `id` | Remove task |

### Execute flow

```
task_manager({ action: "execute", id: "task-xxx" })
         │
         ├──► 1. Load task from server
         │         ├──► If no agent assigned → error
         │         └──► If task not found → error
         │
         ├──► 2. Resolve agent definition
         │         ├──► Try server table "agents"
         │         └──► Fallback to ~/.pi/agent/agents/*.md
         │
         ├──► 3. Spawn pi --mode json
         │         ├──► Agent markdown as system prompt
         │         └──► Task description + input as user prompt
         │
         ├──► 4. Capture JSONL output
         │         └──► Extract assistant text block
         │
         └──► 5. Update task in server
                   ├──► success → status: completed, output: text
                   └──► failure → status: failed, error_message: stderr
```

## Quick Workflow Examples

### Single task

```typescript
// 1. Create
const t = await task_manager({
  action: "create",
  title: "Refactor database connection",
  description: "Move DB config to environment variables",
  priority: "high",
  tags: "refactor,database"
});

// 2. Assign
await task_manager({ action: "assign", id: t.id, agent: "worker" });

// 3. Execute
await task_manager({ action: "execute", id: t.id });

// 4. Review result
await task_manager({ action: "get", id: t.id });
```

### Chain workflow via parent/child

```typescript
// Parent: plan
const plan = await task_manager({ action: "create", title: "Plan OAuth integration", agent: "planner" });
await task_manager({ action: "execute", id: plan.id });
const planResult = await task_manager({ action: "get", id: plan.id });

// Child: implement based on plan output
const impl = await task_manager({
  action: "create",
  title: "Implement OAuth",
  input: planResult.output,
  parent_id: plan.id,
  agent: "worker"
});
await task_manager({ action: "execute", id: impl.id });
```

### Batch via tags

```typescript
// List all pending auth tasks
await task_manager({ action: "list", status: "pending", tags: "auth" });

// List all tasks assigned to worker
await task_manager({ action: "list", agent: "worker" });
```

## Slash Command: `/task`

Quick UI without tool calls:

```bash
/task list              # Show last 20 tasks
/task create Fix login  # Create task with title
```

## Integration with subagent ecosystem

| Component | Role |
|-----------|------|
| `subagent` tool | Direct ad-hoc delegation (no persistence) |
| `task_manager` tool | Persistent, trackable, retryable delegation |
| `agents` table | Agent definitions (shared with subagent discovery) |
| `messages` table | Conversation logs linked via `conversation_id` |

## Best Practices

1. **Always create before execute**: Keeps audit trail
2. **Use parent_id for epics**: Large features → multiple subtasks
3. **Tag by sprint/topic**: Easy filtering later
4. **Read output before next task**: Chain tasks by passing output as `input`
5. **Check `attempts` before retry**: Don't loop forever

## See Also

- `skill-registry` — Dynamic skill discovery
- `agent-registry` — Hybrid agent discovery
- `memory-management` — Persist conversations
- `subagent` extension — Direct delegation tool
