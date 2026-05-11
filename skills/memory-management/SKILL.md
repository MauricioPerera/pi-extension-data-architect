---
name: memory-management
version: 1.0.0
tags: memory,conversation,persistence,context,recovery,messages,compaction
author: MauricioPerera
description: >
  Documentation and workflow for persisting Pi conversation messages to js-doc-store-server.
  Survives context compaction. Covers schema, saving, querying, and recovery.
---

# Memory Management Skill

## Purpose

Prevent conversation data loss when Pi compacts/summarizes long sessions. Every user and assistant message is persisted to the `messages` table in js-doc-store-server with auto-incremented turns.

## Prerequisites

- js-doc-store-server running on `http://localhost:3000` (or your URL)
- Valid JWT token (admin role)
- Extension `pi-extension-data-architect` v2.2.0+ installed in Pi

## Schema

Table: `messages`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `conversation_id` | text | ✅ | Group messages by session |
| `turn` | number | ❌ | Auto-incremented per conversation |
| `role` | text | ✅ | `user`, `assistant`, or `system` |
| `content` | text | ✅ | Full message text |
| `timestamp` | text | ❌ | ISO 8601 datetime |
| `model` | text | ❌ | Model name (e.g., `claude-sonnet`) |
| `tool_calls` | text | ❌ | JSON-serialized tool calls |

## Setup (First Time)

```typescript
// 1. Create the messages table
arch_message_create_table()

// 2. Save a test message
arch_message_save({
    conversationId: "my-session-001",
    role: "user",
    content: "Hola, recordá todo lo que digo"
})

// 3. Verify it was saved
arch_message_history({
    conversationId: "my-session-001",
    limit: 10
})
```

## Daily Workflow

### After each user message

```typescript
arch_message_save({
    conversationId: "my-session-001",
    role: "user",
    content: "El usuario pidió crear un nuevo pipeline CI/CD"
})
```

### After each assistant response

```typescript
arch_message_save({
    conversationId: "my-session-001",
    role: "assistant",
    content: "Creado el archivo .github/workflows/deploy.yml con 3 jobs: build, test, deploy.",
    model: "claude-sonnet",
    toolCalls: JSON.stringify([{ tool: "write_file", args: { path: ".github/workflows/deploy.yml" } }])
})
```

> **Auto-turn**: If `turn` is omitted, the tool queries the last turn for that `conversationId` and increments automatically.

## Recovery After Compaction

When Pi compacts history into a summary, the full content is lost from context. To recover:

```typescript
// Get last 50 messages
const history = await arch_message_history({
    conversationId: "my-session-001",
    limit: 50
});

// Inject back into context (as text) so Pi can answer follow-ups
// e.g. "What did we discuss about the database schema?"
```

## Listing All Active Conversations

```typescript
arch_conversations()
// Returns:
// - my-session-001: 47 messages
// - dev-task-ssh: 12 messages
// - deploy-plan: 8 messages
```

## Admin Queries (via REST API)

If you need raw access outside Pi tools:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!"}' \
  | sed -n 's/.*"token":"\\([^"]*\\)".*/\\1/p')

# Count messages by role
curl -s -X POST http://localhost:3000/admin/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "messages",
    "filter": {"conversation_id":"my-session-001"},
    "sort": {"turn":1}
  }'
```

## Best Practices

- **Use descriptive conversation IDs**: `pi-session-YYYY-MM-DD-task-name` instead of random UUIDs
- **Save tool calls**: Include `toolCalls` so the full interaction (not just text) is recoverable
- **Limit recovery**: When restoring context, inject only the last N messages (e.g., 20) to avoid token overflow
- **Clean up old sessions**: Periodically remove conversations older than 30 days with `arch_remove`
- **One table, many sessions**: A single `messages` table handles all conversations via `conversation_id`

## Integration with Bootstrap

Starting from v2.2.0, `scripts/bootstrap.cjs` automatically creates the `messages` table on first run:

```bash
cd pi-extension-data-architect
node scripts/bootstrap.cjs http://localhost:3000 YOUR_JWT_TOKEN
# ✅ Table "messages" created.
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Table not found` | Table doesn't exist | Run `arch_message_create_table()` |
| `Remote API mode required` | Pi is in local mode | Start js-doc-store-server and set `JS_DOC_STORE_API_URL` |
| `Unauthorized` | Token expired | Re-login: `POST /auth/login` |
| Duplicate turns | Manual turn numbers conflict | Omit `turn` from `arch_message_save` to auto-increment |

## See Also

- `skill-registry` — Dynamic skill discovery
- `data-architect` — Schema design and CRUD
- `doc-store-server` — js-doc-store-server administration
