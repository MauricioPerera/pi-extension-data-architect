# Pi Extension: Data Architect

Pi Extension: Data Architect empowers the AI agent to autonomously design and manage data architectures using [js-doc-store](https://www.npmjs.com/package/js-doc-store). 

Instead of just writing code, the agent can now build its own internal data systems—like CRMs, Wikis, CMSs, or custom knowledge bases—dynamically during a session.

## ✨ Features

- **Autonomous Schema Design**: The agent can create tables with specific columns, types, and validations.
- **Full CRUD**: Complete control over data insertion, querying, and updating.
- **Advanced Analytics**: Access to the Aggregation Pipeline for sums, averages, and complex joins.
- **Zero Overhead**: No external database server required. Everything is stored in lightweight JSON files.
- **Persistant Memory**: Architectures are saved on disk and persist across sessions.

## 🚀 Installation

You can install this extension directly via the `pi` CLI:

```bash
pi install git:https://github.com/your-username/pi-extension-data-architect
```

## 🛠️ Available Tools

| Tool | Description |
|---|---|
| `arch_create_table` | Define a new architecture (table) with a specific schema. |
| `arch_insert` | Add data to a table. |
| `arch_query` | Search documents using MongoDB-style filters. |
| `arch_update` | Update documents using operators like `$set` or `$inc`. |
| `arch_aggregate` | Perform complex data analysis and grouping. |
| `arch_list_tables` | List all architectures created by the agent. |
| `arch_get_schema` | Retrieve the definition of a specific table. |

## 📚 Example Usage

**Prompt the agent:**
*"I need a system to track my book collection. Create a table called `books` with columns for Title, Author, Genre, and Finished (checkbox). Add 3 of my favorite books to the database."*

**The agent will:**
1. Call `arch_create_table` to define the schema.
2. Call `arch_insert` three times to populate the data.
3. Store everything in `.pi/agent/dynamic-data` on your machine.

## 📄 License
MIT
