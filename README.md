# Pi Extension: Data Architect v2.0

Pi Extension: Data Architect empowers the AI agent to autonomously design and manage data architectures using [js-doc-store](https://www.npmjs.com/package/js-doc-store) locally or [js-doc-store-server](https://github.com/MauricioPerera/js-doc-store-server) via REST API.

Instead of just writing code, the agent can now build its own internal data systems—like CRMs, Wikis, CMSs, or custom knowledge bases—dynamically during a session. **v2.0 adds semantic search with embeddings via vector database integration!**

---

## ✨ Features

### Core Features (v1.0)
- **Autonomous Schema Design**: The agent can create tables with specific columns, types, and validations.
- **Full CRUD**: Complete control over data insertion, querying, updating, and deletion.
- **Advanced Analytics**: Access to the Aggregation Pipeline for sums, averages, and complex joins.
- **Zero Overhead**: No external database server required in local mode. Everything is stored in lightweight JSON files.
- **Persistant Memory**: Architectures are saved on disk and persist across sessions.

### New in v2.0: Vector Semantic Search
- **Dual Mode**: Switch between local storage (js-doc-store) and remote API (js-doc-store-server)
- **Semantic Search**: Index and search documents using embedding vectors
- **Hybrid Search**: Combine vector similarity with BM25 text relevance
- **Cross-Collection Search**: Search across multiple collections simultaneously
- **Matryoshka Search**: Multi-stage dimensional search for efficiency

---

## 🚀 Installation

You can install this extension directly via the `pi` CLI:

```bash
pi install git:https://github.com/MauricioPerera/pi-extension-data-architect
```

---

## ⚙️ Configuration

Configure the extension via Pi settings:

```bash
# Set mode (local or remote)
pi settings set dataArchitectMode remote

# For remote mode, set the API URL
pi settings set dataArchitectApiUrl https://js-doc-store-server.rckflr.workers.dev

# For remote mode with authentication, set the JWT token
pi settings set dataArchitectApiToken your-jwt-token

# For local mode, set the data directory (optional, has default)
pi settings set dataArchitectDir /path/to/data
```

### Mode Comparison

| Feature | Local Mode | Remote Mode |
|---------|-----------|-------------|
| Storage | Local JSON files | Cloudflare Workers + KV |
| Vector Search | ❌ Not available | ✅ Full support |
| Authentication | Not needed | JWT required |
| Persistence | Local only | Cloud persistent |
| Network | Offline capable | Requires internet |

---

## 🛠️ Available Tools

### Document Store Tools (Both Modes)

| Tool | Description |
|------|-------------|
| `arch_mode` | Check current mode (local/remote) and configuration |
| `arch_create_table` | Define a new architecture (table) with a specific schema |
| `arch_insert` | Add data to a table |
| `arch_query` | Search documents using MongoDB-style filters |
| `arch_update` | Update documents using operators like `$set` or `$inc` |
| `arch_remove` | Remove documents matching a filter |
| `arch_aggregate` | Perform complex data analysis and grouping |
| `arch_list_tables` | List all architectures created by the agent |
| `arch_get_schema` | Retrieve the definition of a specific table |

### Vector Search Tools (Remote Mode Only)

| Tool | Description |
|------|-------------|
| `arch_vector_index` | Index a document with its embedding vector |
| `arch_vector_batch` | Batch index multiple vectors |
| `arch_vector_search` | Semantic search using embedding vectors |
| `arch_vector_search_hybrid` | Hybrid search (vector + BM25) |
| `arch_vector_search_cross` | Search across multiple collections |
| `arch_vector_collections` | List vector collections with counts |
| `arch_vector_delete` | Remove a vector from the index |
| `arch_vector_drop` | Delete an entire vector collection |

---

## 📚 Example Usage

### Basic Document Store (Local Mode)

**Prompt the agent:**
*"I need a system to track my book collection. Create a table called `books` with columns for Title, Author, Genre, and Finished (checkbox). Add 3 of my favorite books to the database."*

**The agent will:**
1. Call `arch_create_table` to define the schema.
2. Call `arch_insert` three times to populate the data.
3. Store everything in `.pi/agent/dynamic-data` on your machine.

### Vector Semantic Search (Remote Mode)

**Prompt the agent:**
*"Set up remote mode, then create a collection for my knowledge base. Index these articles about AI with their embeddings, then search for content related to 'machine learning applications'."*

**The agent will:**
1. Call `arch_mode` to verify remote configuration
2. Call `arch_vector_batch` to index articles with embeddings
3. Call `arch_vector_search` to find semantically similar content

**Example workflow:**
```typescript
// Index documents with embeddings
arch_vector_batch({
  collection: "knowledge_base",
  vectors: [
    { id: "article_1", vector: [0.1, -0.2, ...], metadata: { title: "AI in Healthcare" } },
    { id: "article_2", vector: [0.3, 0.1, ...], metadata: { title: "ML for Finance" } }
  ]
})

// Search with embedding
arch_vector_search({
  collection: "knowledge_base",
  vector: [0.15, -0.18, ...], // Query embedding from your model
  limit: 5,
  metric: "cosine"
})

// Hybrid search (vector + text)
arch_vector_search_hybrid({
  collection: "knowledge_base",
  vector: [0.15, -0.18, ...],
  text: "machine learning applications",
  limit: 10,
  mode: "rrf"
})
```

---

## 🔧 Generating Embeddings

To use vector search, you need to generate embeddings from text. You can use:

### Cloudflare Workers AI (Free tier available)
```bash
curl https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai/run/@cf/google/embeddinggemma-300m \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":["Your text here"]}'
```

### OpenAI API
```bash
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "Your text here", "model": "text-embedding-3-small"}'
```

### Local Models
You can also use local models like `sentence-transformers` or `ollama` with embedding models.

---

## 🎯 Skills (The "Why" and "When")

This package includes specialized skills that tell the agent how to use these tools professionally:

### Data Architect Skill
Guidance on how to design a cohesive data system from a user's request:
1. **Analysis** → Understand requirements
2. **Design** → Plan schema and relationships
3. **Implementation** → Create tables and populate data

### Tree Operator Skill
A specialized methodology for managing "Reasoning Trees". It teaches the agent to navigate documents by descending through hierarchical summaries rather than performing flat searches, ensuring high precision and traceability.

---

## 📊 Vector Store Configuration

When using remote mode, the server can be configured with different vector store types:

| Store Type | Compression | Recall | Best For |
|-----------|-------------|--------|----------|
| `float32` | 1x | 100% | Maximum precision |
| `int8` | 4x | 100% | Balance |
| `binary` | 32x | 85% | Maximum compression |
| `polar` | 21x | 100% | **Best trade-off** |

Configure in your js-doc-store-server deployment.

---

## 📝 Changelog

### v2.0.0
- Added remote API mode support
- Added vector search tools (9 new tools)
- Added hybrid search (vector + BM25)
- Added cross-collection search
- Added matryoshka multi-stage search support
- Maintained backward compatibility with local mode

### v1.0.0
- Initial release with js-doc-store local integration
- CRUD operations
- Aggregation pipeline
- Schema management

---

## 📄 License

MIT
