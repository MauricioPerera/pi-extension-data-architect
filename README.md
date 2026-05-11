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

### New in v2.1: Dynamic Skill Registry
- **Meta-Skill Pattern**: Keep only ONE `SKILL.md` on the filesystem (`skill-discovery`)
- **On-Demand Loading**: Query the `skills` table by tags to inject only relevant context
- **Versioning**: Track skill evolution with a `version` field
- **Tag-Based Discovery**: Find skills by topic (`crm`, `vps`, `rag`) without knowing filenames
- **Cross-Session Persistence**: Skills survive Pi restarts (stored in `data/skills.json`)
- **Easy Registration**: New skill = one `arch_insert` call

---

## 🚀 Installation

You can install this extension directly via the `pi` CLI:

```bash
pi install git:https://github.com/MauricioPerera/pi-extension-data-architect
```

> **First time using this extension?** Follow the [🟢 First-Time Setup](#-first-time-setup) guide below to bootstrap the skill registry.

---

## 🔰 First-Time Setup

> **Assumption:** You are using `js-doc-store-server` for the **first time** and have just installed this extension.

### Step 1: Start the Server

Make sure `js-doc-store-server` is running. If you haven't set it up yet, clone and start it:

```bash
git clone https://github.com/MauricioPerera/js-doc-store-server.git
cd js-doc-store-server
npm install
cp .env.example .env   # Edit with your secrets
node server.js         # Or: node daemon.js start
```

Verify it's up:
```bash
curl http://localhost:3000/public/tables
```

### Step 2: Get a JWT Token

Login with the default credentials (or use your own after registering):

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!"}'
```

Save the `token` from the response.

### Step 3: Configure Pi Settings

Tell the extension where your server is and how to authenticate:

```bash
pi settings set dataArchitectMode remote
pi settings set dataArchitectApiUrl http://localhost:3000
pi settings set dataArchitectApiToken YOUR_JWT_TOKEN
```

### Step 4: Bootstrap the Skill Registry

This extension ships with 3 built-in skills (`data-architect`, `tree-operator`, `skill-registry`). Register them into the database so Pi can discover them on-demand.

```bash
cd node_modules/pi-extension-data-architect   # or wherever it was installed

node scripts/bootstrap.cjs http://localhost:3000 YOUR_JWT_TOKEN
```

Or with environment variables:
```bash
export JS_DOC_STORE_API_URL=http://localhost:3000
export JS_DOC_STORE_TOKEN=YOUR_JWT_TOKEN
node scripts/bootstrap.cjs
```

> **What this does:**
> - Creates the `skills` table if it doesn't exist
> - Inserts the 3 built-in skills with their full markdown content
> - Skips duplicates if you run it again

### Step 5: Clean Up Your Filesystem

Delete duplicate skills from `~/.agents/skills/` **except** `skill-discovery/`.

```bash
ls ~/.agents/skills/
# Keep ONLY:  skill-discovery/
# Delete:     data-architect/, tree-operator/, ...
```

✅ **Done.** You now have a single meta-skill on disk and the rest in the database. Pi will load `skill-discovery` and query the rest on-demand.

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
| RAG Sin Vectores | ✅ Reasoning Tree | ✅ Reasoning Tree + Vectores |
| Authentication | Not needed | JWT required |
| Persistence | Local only | Cloud persistent |
| Network | Offline capable | Requires internet |

---

## 📄 RAG Sin Vectores con Reasoning Tree

**La extensión implementa RAG (Retrieval-Augmented Generation) SIN vectores usando el enfoque Reasoning Tree.**

### ¿Cómo funciona?

En lugar de usar embeddings y búsqueda vectorial, el **árbol jerárquico ES el índice de retrieval**:

```
Root (level 0, summary: "Documentación Técnica")
 └─ Branch (level 1, summary: "Autenticación JWT y OAuth2")
     ├─ Branch (level 2, summary: "Implementación de tokens")
     │   ├─ Leaf: "Refresh tokens con expiry"
     │   └─ Leaf: "Revocación de sesiones"
     └─ Branch (level 2, summary: "Flujos OAuth2")
```

### Retrieval por Navegación Jerárquica

1. **Root**: Query `level: 0` → Encontrar dominio general
2. **Branch**: Query `parent_id: root._id` → Analizar summaries → Elegir rama
3. **Leaf**: Query `parent_id: branch._id` → Obtener contenido específico
4. **Contexto**: Root summary + Branch summary + Leaf content = Contexto completo para LLM

### Comparación: Vectores vs Reasoning Tree

| Característica | Vector RAG | Reasoning Tree RAG |
|---------------|-----------|-------------------|
| **Índice** | Espacio vectorial | Jerarquía de nodos |
| **Retrieval** | KNN por similitud | Navegación parent→child |
| **Contexto** | Snippets relacionados | Ruta completa + summaries |
| **Embeddings** | Requeridos (AI/ML) | No requeridos (summaries humanos) |
| **Dependencies** | API embeddings | Zero dependencies |
| **Explicabilidad** | Caja negra | Ruta transparente |

### Herramientas para RAG Sin Vectores

| Herramienta | Uso |
|------------|-----|
| `arch_query` + `level: 0` | Encontrar raíces del árbol |
| `arch_query` + `parent_id: X` | Navegar a hijos de un nodo |
| `arch_query` + `summary: { $regex: ... }` | Buscar por resumen semántico |
| `arch_tree_navigate` (nueva) | Navegación automática con contexto ensamblado |

**Ver `skills/tree-operator/SKILL.md` para el workflow completo de navegación.**

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

## 🎯 Real-World Use Cases & Examples

### 1. Personal CRM (Local Mode)

**Use Case:** Track contacts, interactions, and deals.

**Prompt:**
*"Create a personal CRM with tables for contacts and interactions. Each contact should have name, email, company, status (Lead/Active/Churned), and revenue. Track all email exchanges and meetings with each contact."*

**Workflow:**
```typescript
// Create schema
arch_create_table({
  tableName: "contacts",
  columns: [
    { name: "name", type: "text", required: true },
    { name: "email", type: "email", required: true, unique: true },
    { name: "company", type: "text" },
    { name: "status", type: "select", options: ["Lead", "Active", "Churned"], default: "Lead" },
    { name: "revenue", type: "number", default: 0 },
    { name: "tags", type: "multiselect", options: ["VIP", "Enterprise", "SMB"] }
  ]
})

arch_create_table({
  tableName: "interactions",
  columns: [
    { name: "contact_id", type: "relation", required: true },
    { name: "type", type: "select", options: ["Email", "Call", "Meeting", "Note"] },
    { name: "content", type: "text", required: true },
    { name: "date", type: "text" }
  ]
})

// Query with aggregation
arch_aggregate({
  tableName: "contacts",
  pipeline: [
    { stage: "match", params: { status: "Active" } },
    { stage: "group", params: { field: "company", accumulators: { totalRevenue: { $sum: "revenue" }, count: { $count: true } } } },
    { stage: "sort", params: { totalRevenue: -1 } }
  ]
})
```

---

### 2. Knowledge Base with RAG (Remote Mode + Vector Search)

**Use Case:** Build a semantic knowledge base for Retrieval Augmented Generation (RAG).

**Prompt:**
*"Create a knowledge base collection. I'll give you technical documentation about our API - index each endpoint with its description embedding. Then I can ask questions like 'How do I handle rate limiting?' and get relevant documentation."*

**Workflow:**
```typescript
// First, enable remote mode
// Then index documentation
const docs = [
  { id: "rate-limiting", text: "API rate limits are 100 requests per minute. Use exponential backoff for retries. Headers include X-RateLimit-Remaining." },
  { id: "auth", text: "Authentication uses Bearer tokens in the Authorization header. Tokens expire after 24 hours." },
  { id: "pagination", text: "Paginated responses include next_cursor and has_more. Use cursor parameter for next page." }
];

// Generate embeddings (using Workers AI, OpenAI, or local model)
const embeddings = await generateEmbeddings(docs.map(d => d.text));

// Index with vectors
arch_vector_batch({
  collection: "api_docs",
  vectors: docs.map((doc, i) => ({
    id: doc.id,
    vector: embeddings[i],
    text: doc.text,
    metadata: { category: "api", created: new Date().toISOString() }
  }))
})

// Query time
const queryEmbedding = await generateEmbedding("How do I handle rate limits?");
arch_vector_search_hybrid({
  collection: "api_docs",
  vector: queryEmbedding,
  text: "rate limits handling",
  limit: 3,
  mode: "rrf"
})
// Returns: [{ id: "rate-limiting", score: 0.92, ... }]
```

---

### 3. Smart Bookmarks (Hybrid Mode)

**Use Case:** Bookmark articles with full-text search AND semantic search.

**Prompt:**
*"I want to save articles I read online. Store the URL, title, and full text. When I search for 'machine learning in healthcare', find articles about ML even if they don't have those exact words."*

**Workflow:**
```typescript
// Table for metadata
arch_create_table({
  tableName: "bookmarks",
  columns: [
    { name: "url", type: "url", required: true },
    { name: "title", type: "text", required: true },
    { name: "full_text", type: "text" },
    { name: "tags", type: "multiselect", options: ["AI", "Web", "Security", "Cloud"] },
    { name: "read_date", type: "text" },
    { name: "vector_id", type: "text" } // Links to vector collection
  ]
})

// Save bookmark
const bookmark = arch_insert({
  tableName: "bookmarks",
  data: {
    url: "https://example.com/ai-article",
    title: "Deep Learning in Medicine",
    full_text: "Neural networks are transforming diagnostic imaging...",
    tags: ["AI"],
    read_date: "2024-01-15"
  }
})

// Create embedding and index
const embedding = await generateEmbedding("Deep Learning in Medicine Neural networks diagnostic imaging");
arch_vector_index({
  collection: "bookmark_vectors",
  id: bookmark.id,
  vector: embedding,
  text: "Deep Learning in Medicine Neural networks diagnostic imaging",
  metadata: { bookmark_id: bookmark.id, title: "Deep Learning in Medicine" }
})

// Search
const queryEmbedding = await generateEmbedding("machine learning healthcare");
const results = arch_vector_search_hybrid({
  collection: "bookmark_vectors",
  vector: queryEmbedding,
  text: "machine learning healthcare",
  limit: 10
})

// Fetch full bookmark data
const bookmarkIds = results.map(r => r.metadata.bookmark_id);
arch_query({
  tableName: "bookmarks",
  filter: { _id: { $in: bookmarkIds } }
})
```

---

### 4. Session Memory with Context

**Use Case:** The agent remembers context from previous conversations.

**Prompt:**
*"Create a memory system that persists our conversations. When I ask 'What did we discuss about the database schema last week?' find relevant previous interactions."*

**Workflow:**
```typescript
// Each conversation turn
arch_insert({
  tableName: "conversation_memory",
  data: {
    session_id: "abc-123",
    timestamp: Date.now(),
    role: "user",
    message: "We need to redesign the user table",
    topics: ["database", "schema", "users"]
  }
})

// With vector search (remote mode)
const queryEmbedding = await generateEmbedding("database schema users table");
arch_vector_search({
  collection: "conversation_vectors",
  vector: queryEmbedding,
  limit: 5,
  matryoshka: [128, 384, 768] // Faster search
})
```

---

### 5. Multi-Tenant Document System

**Use Case:** Separate documents by user/project with cross-collection search.

**Prompt:**
*"I manage documents for multiple clients. Each client has their own collection. Sometimes I need to search across all clients for similar contracts or proposals."*

**Workflow:**
```typescript
// Collections per client
const clients = ["acme_corp", "globex", "initech"];

// Index documents
for (const client of clients) {
  arch_vector_batch({
    collection: `${client}_docs`,
    vectors: documents.map(doc => ({
      id: doc.id,
      vector: doc.embedding,
      metadata: { type: doc.type, date: doc.date }
    }))
  });
}

// Search within one client
arch_vector_search({
  collection: "acme_corp_docs",
  vector: queryEmbedding,
  limit: 10
})

// Search across ALL clients
arch_vector_search_cross({
  collections: clients.map(c => `${c}_docs`),
  vector: queryEmbedding,
  limit: 15
})
```

---

### 6. Analytics Dashboard Data

**Use Case:** Aggregate data for reporting.

**Prompt:**
*"Track user signups and activity. Show me a breakdown by month and source, with totals and averages."*

**Workflow:**
```typescript
// Store events
arch_insert({
  tableName: "events",
  data: {
    user_id: "user_123",
    event_type: "signup",
    source: "twitter",
    timestamp: Date.now(),
    month: "2024-01"
  }
})

// Analytics pipeline
arch_aggregate({
  tableName: "events",
  pipeline: [
    { stage: "match", params: { event_type: "signup" } },
    { stage: "group", params: {
      field: "month",
      accumulators: {
        totalSignups: { $count: true },
        bySource: { $push: "source" }
      }
    }},
    { stage: "sort", params: { _id: -1 } }, // Sort by month descending
    { stage: "limit", params: 12 } // Last 12 months
  ]
})
```

---

### 7. Recommendation Engine (Vector Search)

**Use Case:** Find similar items based on embeddings.

**Prompt:**
*"I have products with descriptions. When a user views a product, suggest similar ones based on semantic similarity."*

**Workflow:**
```typescript
// Index products
const products = [
  { id: "prod_1", name: "Wireless Headphones", desc: "Bluetooth noise-canceling headphones with 20h battery" },
  { id: "prod_2", name: "Running Shoes", desc: "Lightweight breathable shoes for marathon training" },
  { id: "prod_3", name: "Gaming Headset", desc: "Surround sound headset with mic for gaming" }
];

// Generate embeddings for descriptions
const embeddings = await Promise.all(
  products.map(p => generateEmbedding(p.desc))
);

arch_vector_batch({
  collection: "products",
  vectors: products.map((p, i) => ({
    id: p.id,
    vector: embeddings[i],
    metadata: { name: p.name, category: "electronics" }
  }))
});

// Recommend similar to product 1
const product1Embedding = embeddings[0]; // Wireless Headphones
arch_vector_search({
  collection: "products",
  vector: product1Embedding,
  limit: 3,
  metric: "cosine"
})
// Returns: [prod_1 (1.0), prod_3 (0.85 - Gaming Headset), prod_2 (0.23 - Running Shoes)]
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

### Skill Registry
A meta-architecture pattern that transforms `js-doc-store-server` into a **dynamic skill registry**. Instead of loading all `SKILL.md` files from the filesystem at startup, Pi keeps only ONE meta-skill (`skill-discovery`) on disk and discovers all specialized skills on-demand via tag-based queries. This dramatically reduces context overhead and enables versioning, search, and cross-session persistence. See `skills/skill-registry/SKILL.md` for the full workflow, migration script, and benefits.

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
