# Skill Registry — Dynamic Skill Discovery

This skill enables **Pi** to use `js-doc-store-server` as a dynamic skill registry. Instead of keeping dozens of `SKILL.md` files scattered in `~/.agents/skills/`, only **one** meta-skill lives on the filesystem. All functional skills are stored in the `skills` table and discovered on-demand via tag-based queries.

## Problem with Static Filesystem Skills

| Issue | Consequence |
|-------|-------------|
| Pi loads **all** `SKILL.md` files at startup | Massive context overload |
| No search by topic | Must know exact filename |
| No versioning | Skills evolve but files don't track it |
| Multi-session portability | Files are local to one machine |
| No semantic discovery | Can't find "CRM" skill via "customer" query |

## The Registry Pattern

```
Filesystem (~/.agents/skills/)
└── skill-discovery/SKILL.md    ← SINGLE skill on disk

js-doc-store-server (localhost:3000)
└── table: skills
    ├── data-architect     → content: full SKILL.md
    ├── tree-operator      → content: full SKILL.md
    ├── vps-management     → content: full SKILL.md
    ├── github-management  → content: full SKILL.md
    └── ... (any skill)
```

## Schema

Register this table in your `js-doc-store-server`:

```json
{
  "tableName": "skills",
  "columns": [
    { "name": "name",        "type": "text", "required": true },
    { "name": "version",     "type": "text" },
    { "name": "tags",        "type": "text" },
    { "name": "description", "type": "text" },
    { "name": "content",     "type": "text", "required": true }
  ]
}
```

## Workflow

### 1. One-Time Setup (per Pi installation)

Create the `skills` table:

```bash
TOKEN=$(pi auth login --output-token)

pi tools call arch_create_table --params '{
  "tableName": "skills",
  "columns": [
    {"name":"name","type":"text","required":true},
    {"name":"version","type":"text"},
    {"name":"tags","type":"text"},
    {"name":"description","type":"text"},
    {"name":"content","type":"text","required":true}
  ]
}'
```

Keep **only** `skill-discovery/SKILL.md` in `~/.agents/skills/`. Delete all other filesystem skills.

### 2. Register Existing Skills

For every `SKILL.md` you have:

```bash
# Read file content
CONTENT=$(cat ~/.agents/skills/my-skill/SKILL.md)

# Insert into registry
pi tools call arch_insert --params '{
  "tableName": "skills",
  "data": {
    "name": "my-skill",
    "version": "1.0.0",
    "tags": "tag1,tag2,topic",
    "description": "Brief description for listings",
    "content": "'"$CONTENT"'"
  }
}'
```

Or use the `skill-registry.js` helper script (see `examples/` in this extension).

### 3. Discovery by User Intent

When the user says:
- *"I need a CRM"* → query tags with `$regex: "crm"`
- *"How do I deploy to my VPS?"* → query tags with `$regex: "vps|deploy"`
- *"Set up RAG"* → query tags with `$regex: "rag"`

```typescript
const results = await arch_query({
  tableName: "skills",
  filter: { tags: { $regex: "vps" } }
});
// Inject results[0].content into prompt context
```

### 4. Retrieve Full Skill Content

```typescript
const skill = await arch_query({
  tableName: "skills",
  filter: { name: "vps-management" }
});
// skill.data[0].content === complete markdown text
```

### 5. Register New Skill from Conversation

```typescript
await arch_insert({
  tableName: "skills",
  data: {
    name: "stripe-integration",
    version: "1.0.0",
    tags: "payment,stripe,api,ecommerce",
    description: "Integrate Stripe checkout and webhooks",
    content: "# Stripe Integration Skill\n\n## Setup..."
  }
});
```

## Tool Combinations for Skill Management

| Task | Tool Sequence |
|------|---------------|
| **Discover by topic** | `arch_query` → filter `tags: { $regex: "topic" }` |
| **Load skill context** | `arch_query` → filter `name: "exact-name"` → read `.content` |
| **Register new skill** | `arch_insert` into `skills` table |
| **Update skill version** | `arch_update` with `$set: { version, content }` |
| **List all skills** | `arch_query` with empty filter (or `arch_list_tables` for schemas) |
| **Delete obsolete skill** | `arch_remove` with filter `{ name: "skill-name" }` |

## Migration from Filesystem to Registry

1. Keep `skill-discovery/SKILL.md` as the only filesystem skill
2. Run the migration script (`examples/migrate-skills.js`) once
3. Delete duplicate filesystem skills (they are now in DB)
4. Future sessions: Pi loads `skill-discovery` → queries DB → gets specialized context

## Benefits

| Benefit | Explanation |
|---------|-------------|
| **Selective Loading** | Only load skills relevant to the current conversation |
| **Context Efficiency** | Avoid injecting 10+ skill files when you need 1 |
| **Versioning** | Field `version` tracks skill evolution |
| **Tag Search** | Find skills by topic, not just filename |
| **Cross-Session Persistence** | Skills survive Pi restarts (stored in `data/`) |
| **Easy Registration** | New skill = 1 `arch_insert` call |
| **Centralized Source** | Everything in one `skills` table |

## Example: Complete Migration Script

```javascript
// migrate-skills.js
const fs = require('fs');
const path = require('path');

async function migrateSkills(apiUrl, token, skillsDir) {
  const dirs = fs.readdirSync(skillsDir)
    .filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory());

  for (const dir of dirs) {
    const file = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const match = content.match(/^# (.+)$/m);
    const title = match ? match[1] : dir;

    await fetch(`${apiUrl}/admin/insert`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tableName: 'skills',
        data: {
          name: dir,
          version: '1.0.0',
          tags: dir,
          description: title,
          content
        }
      })
    });

    console.log(`Migrated: ${dir}`);
  }
}

// Usage:
// migrateSkills('http://localhost:3000', TOKEN, process.env.HOME + '/.agents/skills');
```

## Constraints

- **One filesystem skill minimum**: Pi requires at least one `SKILL.md` to boot. Use `skill-discovery`.
- **Tags are comma-separated**: Use `database,api,server` not `database api server`.
- **Content field is required**: A skill without content is useless for context injection.
- **Server must be running**: Discovery fails if `js-doc-store-server` is offline (fallback: use filesystem backup).
