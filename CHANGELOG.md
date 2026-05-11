# Changelog

All notable changes to this project will be documented in this file.

## [2.3.0] - 2026-05-11
### Added
- **Cloudflare MCP Integration**: Pi can now call Cloudflare's MCP server directly via two new native tools — no separate MCP client app required.
  - `arch_cf_mcp_search`: Sends JS to explore Cloudflare's OpenAPI spec (Code Mode `search` tool).
  - `arch_cf_mcp_execute`: Sends JS to call Cloudflare API via `cloudflare.request()` (Code Mode `execute` tool).
  - Internally speaks JSON-RPC 2.0 over HTTP to `https://mcp.cloudflare.com/mcp`.
  - Requires `CLOUDFLARE_API_TOKEN` environment variable or Pi setting.

## [2.2.0] - 2026-05-11
### Added
- **Conversation Memory**: Store every message in `messages` table to survive context compaction.
- **4 New Tools**:
  - `arch_message_save`: Persist user/assistant messages with auto-incremented turns.
  - `arch_message_history`: Retrieve full conversation history by conversation ID.
  - `arch_conversations`: List all stored conversations with message counts.
  - `arch_message_create_table`: Bootstrap the `messages` table.
- **Auto-Turn Tracking**: `arch_message_save` automatically queries last turn and increments.
- **Updated README**: Added Conversation Memory to Features section.
- **Updated Bootstrap Script**: Registers `messages` table creation on first run.

## [2.1.0] - 2026-05-11
### Added
- **Dynamic Skill Registry**: New `skill-registry` skill enabling on-demand skill discovery via js-doc-store-server.
- **Meta-Skill Pattern**: Pi keeps only ONE skill (`skill-discovery`) on the filesystem; all others live in the `skills` table.
- **Tag-Based Discovery**: Query skills by topic (e.g., `$regex: "crm|vps"`) instead of loading all files.
- **Skill Versioning**: Track skill evolution with a `version` field in the registry.
- **Cross-Session Persistence**: Skills survive Pi restarts (stored in `data/skills.json`).
- **4 New Tools**:
  - `arch_skill_register`: Register a SKILL.md file into the registry.
  - `arch_skill_discover`: Find skills by tags.
  - `arch_skill_load`: Retrieve full skill content for context injection.
  - `arch_skill_create_table`: Bootstrap the `skills` table.
- **Migration Script**: `examples/skill-registry-migration.js` for migrating existing filesystem skills.
- **Updated Documentation**: README now covers the Skill Registry pattern and its benefits.

## [1.0.0] - 2026-05-09
### Added
- Initial release of `pi-extension-data-architect`.
- Core `data-architect` extension with CRUD and Aggregation tools.
- `Data Architect` skill for autonomous schema design.
- `Tree Operator` skill for reasoning-based hierarchical navigation.
- `docs/reasoning-tree.md` explaining the vectorless RAG philosophy.
- Example blueprints for CRM and Wiki systems.
- Integrated `js-doc-store` for local-first persistence.
