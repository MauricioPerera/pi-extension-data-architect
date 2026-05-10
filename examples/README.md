# Data Architect Examples

This directory contains ready-to-use blueprints for common data architecture patterns.

## Available Blueprints

### 1. CRM Blueprint (`crm-blueprint.json`)
Personal customer relationship management for freelancers and small businesses.

**Tables:**
- `contacts` - People and companies
- `interactions` - Touchpoint log
- `deals` - Sales pipeline

**Use Cases:**
- Track leads and prospects
- Log calls, emails, meetings
- Monitor deal pipeline value

**Quick Start:**
```typescript
// Load the blueprint and create tables
arch_create_table({ tableName: "contacts", columns: blueprint.tables[0].columns })
arch_create_table({ tableName: "interactions", columns: blueprint.tables[1].columns })
arch_create_table({ tableName: "deals", columns: blueprint.tables[2].columns })

// Add a contact
arch_insert({
  tableName: "contacts",
  data: {
    name: "John Doe",
    email: "john@example.com",
    company: "Acme Corp",
    status: "Prospect",
    revenue_potential: 50000,
    tags: ["Enterprise"],
    created_at: new Date().toISOString()
  }
})

// Query hot leads
arch_query({
  tableName: "contacts",
  filter: { status: "Prospect", revenue_potential: { $gte: 10000 } },
  sort: { revenue_potential: -1 }
})

// Pipeline analytics
arch_aggregate({
  tableName: "deals",
  pipeline: [
    { stage: "group", params: { field: "stage", accumulators: { total: { $sum: "value" } } } }
  ]
})
```

---

### 2. Knowledge Base RAG (`knowledge-base-rag.json`)
Retrieval Augmented Generation system for semantic document search.

**Requirements:** Remote mode (js-doc-store-server)

**Tables:**
- `documents` - Document metadata
- `chunks` - Document chunks for granular retrieval
- `queries_log` - Query history for optimization

**Vector Collection:** `kb_vectors` (768d, binary)

**Use Cases:**
- Technical documentation search
- Research paper database
- Company wiki with semantic search
- RAG for LLM context

**Quick Start:**
```typescript
// Requires remote mode
// Configure: pi settings set dataArchitectMode remote

// Create tables
arch_create_table({ tableName: "documents", columns: blueprint.tables[0].columns })

// Index a document (with embeddings)
const doc = arch_insert({
  tableName: "documents",
  data: {
    title: "API Rate Limiting Guide",
    content: "API rate limits are 100 requests per minute...",
    category: "Technical",
    tags: ["API", "Web"],
    indexed_at: new Date().toISOString()
  }
})

// Generate embedding (using your embedding model)
const embedding = await generateEmbedding(doc.content)

// Index for semantic search
arch_vector_index({
  collection: "kb_vectors",
  id: doc._id,
  vector: embedding,
  text: doc.content,
  metadata: { title: doc.title, category: doc.category }
})

// Query with RAG
const queryEmbedding = await generateEmbedding("How many API calls can I make?")
const results = arch_vector_search_hybrid({
  collection: "kb_vectors",
  vector: queryEmbedding,
  text: "API rate limits",
  limit: 5
})
```

---

### 3. Smart Bookmarks (`smart-bookmarks.json`)
Bookmark manager with semantic search and reading tracking.

**Requirements:** Remote mode (js-doc-store-server)

**Tables:**
- `bookmarks` - Saved URLs
- `highlights` - Important passages
- `read_sessions` - Reading time tracking

**Vector Collection:** `bookmark_content` (768d, polar)

**Use Cases:**
- Save articles with full-text search
- Find similar content semantically
- Track reading progress
- Highlight and annotate

**Quick Start:**
```typescript
// Create tables
arch_create_table({ tableName: "bookmarks", columns: blueprint.tables[0].columns })

// Save with content
const bookmark = arch_insert({
  tableName: "bookmarks",
  data: {
    url: "https://example.com/ai-article",
    title: "Deep Learning in Medicine",
    full_text: "Neural networks are transforming diagnostic imaging...",
    folder: "Reading List",
    status: "Unread",
    saved_at: new Date().toISOString()
  }
})

// Index for semantic search
const embedding = await generateEmbedding(bookmark.full_text)
arch_vector_index({
  collection: "bookmark_content",
  id: bookmark._id,
  vector: embedding,
  text: bookmark.full_text,
  metadata: { title: bookmark.title, folder: bookmark.folder }
})

// Smart search
const query = "machine learning healthcare"
const queryEmbedding = await generateEmbedding(query)
arch_vector_search_hybrid({
  collection: "bookmark_content",
  vector: queryEmbedding,
  text: query,
  limit: 10
})
```

---

## Creating Custom Blueprints

A blueprint is a JSON file with:

```json
{
  "name": "Your System",
  "description": "What it does",
  "version": "1.0",
  "requires": "local|remote",
  "tables": [
    {
      "name": "table_name",
      "description": "What this table stores",
      "columns": [
        { "name": "col_name", "type": "text|number|email|select|multiselect|relation|json", ... }
      ]
    }
  ],
  "vector_collections": [ /* for remote mode */ ],
  "workflows": [ /* common operations */ ],
  "example_queries": [ /* sample queries */ ]
}
```

### Column Types

| Type | Description |
|------|-------------|
| `text` | String values |
| `number` | Numeric values |
| `email` | Validated email addresses |
| `url` | Validated URLs |
| `select` | Single choice from options |
| `multiselect` | Multiple choices from options |
| `relation` | Reference to another document |
| `json` | Arbitrary JSON data |
| `checkbox` | Boolean values |
| `autonumber` | Auto-incrementing number |

### Common Patterns

**Timestamp tracking:**
```json
{ "name": "created_at", "type": "text" }
{ "name": "updated_at", "type": "text" }
```

**Soft delete:**
```json
{ "name": "deleted", "type": "checkbox", "default": false }
```

**User ownership:**
```json
{ "name": "owner_id", "type": "text" }
```

**Vector reference:**
```json
{ "name": "vector_id", "type": "text" }
```

---

## Tips

1. **Start Simple:** Begin with basic CRUD, then add complexity
2. **Use Relations:** Link related data across tables
3. **Index Early:** If using remote mode, index vectors from the start
4. **Log Queries:** Track what users search for to optimize
5. **Backup:** Local mode stores in `.pi/agent/dynamic-data/`
