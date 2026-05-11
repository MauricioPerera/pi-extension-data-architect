/**
 * Data Architect Extension v2.0
 *
 * Empowers the AI agent to autonomously design and manage data architectures
 * using js-doc-store (local) or js-doc-store-server (remote API).
 *
 * NEW in v2.0:
 * - Vector search integration (semantic search with embeddings)
 * - Remote API mode support (js-doc-store-server)
 * - Hybrid search (vector + BM25)
 * - Cross-collection search
 *
 * The agent can create CRMs, Wikis, CMSs, or any structured data system on the fly,
 * with full semantic search capabilities.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import fs from "fs";
import path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.pi', 'agent', 'dynamic-data');
const DEFAULT_API_URL = 'https://js-doc-store-server.rckflr.workers.dev';

// ============================================================================
// MODE DETECTION
// ============================================================================

function getMode(settings: any): { mode: 'local' | 'remote', apiUrl?: string, token?: string } {
    const getSetting = (key: string) => settings?.get ? settings.get(key) : settings?.[key];
    const mode = getSetting('dataArchitectMode') || 'local';
    if (mode === 'remote') {
        return {
            mode: 'remote',
            apiUrl: getSetting('dataArchitectApiUrl') || DEFAULT_API_URL,
            token: getSetting('dataArchitectApiToken')
        };
    }
    return { mode: 'local' };
}

// ============================================================================
// API CLIENT (Remote Mode)
// ============================================================================

class ApiClient {
    constructor(private baseUrl: string, private token?: string) {}

    private async request(method: string, path: string, body?: any): Promise<any> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API error ${response.status}: ${error}`);
        }

        return response.json();
    }

    // Auth
    async login(email: string, password: string) {
        return this.request('POST', '/auth/login', { email, password });
    }

    // Admin - Tables
    async createTable(tableName: string, columns: any[]) {
        return this.request('POST', '/admin/create-table', { tableName, columns });
    }

    async insert(tableName: string, data: any) {
        return this.request('POST', '/admin/insert', { tableName, data });
    }

    async query(tableName: string, filter?: any, sort?: any, limit?: number) {
        return this.request('POST', '/admin/query', { tableName, filter, sort, limit });
    }

    async update(tableName: string, filter: any, update: any) {
        return this.request('POST', '/admin/update', { tableName, filter, update });
    }

    async remove(tableName: string, filter: any) {
        return this.request('POST', '/admin/remove', { tableName, filter });
    }

    async aggregate(tableName: string, pipeline: any[]) {
        return this.request('POST', '/admin/aggregate', { tableName, pipeline });
    }

    // Vector Search
    async vectorIndex(collection: string, id: string, vector: number[], metadata?: any, text?: string) {
        return this.request('POST', '/admin/vector/index', { collection, id, vector, metadata, text });
    }

    async vectorBatch(collection: string, vectors: any[]) {
        return this.request('POST', '/admin/vector/batch', { collection, vectors });
    }

    async vectorSearch(collection: string, vector: number[], limit?: number, metric?: string, matryoshka?: number[]) {
        return this.request('POST', '/admin/vector/search', { collection, vector, limit, metric, matryoshka });
    }

    async vectorSearchHybrid(collection: string, vector: number[], text: string, limit?: number, mode?: string) {
        return this.request('POST', '/admin/vector/search-hybrid', { collection, vector, text, limit, mode });
    }

    async vectorSearchCross(collections: string[], vector: number[], limit?: number) {
        return this.request('POST', '/admin/vector/search-cross', { collections, vector, limit });
    }

    async vectorCollections() {
        return this.request('GET', '/admin/vector/collections');
    }

    async vectorDelete(collection: string, id: string) {
        return this.request('DELETE', `/admin/vector/${collection}/${id}`);
    }

    async vectorDrop(collection: string) {
        return this.request('POST', '/admin/vector/drop', { collection });
    }

    // Public
    async listTables() {
        return this.request('GET', '/public/tables');
    }
}

// ============================================================================
// EXTENSION
// ============================================================================

export default function dataArchitectExtension(pi: ExtensionAPI) {
    // Get configuration - handle undefined pi.settings
    const settings = pi?.settings || {};
    const getSetting = (key: string, fallback: string) => {
        if (settings.get) {
            return settings.get(key) || fallback;
        }
        return settings[key] || fallback;
    };

    const DATA_DIR = getSetting('dataArchitectDir', DEFAULT_DATA_DIR);
    const modeConfig = getMode(settings);

    // Local mode: Initialize js-doc-store
    let jsDocStore: any;
    let db: any;
    let tableCache: Map<string, any>;

    if (modeConfig.mode === 'local') {
        try {
            jsDocStore = require("js-doc-store");
            const { DocStore, FileStorageAdapter } = jsDocStore;

            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }

            db = new DocStore(new FileStorageAdapter(DATA_DIR));
            tableCache = new Map<string, any>();
        } catch (e) {
            console.error("js-doc-store is required for local mode. Switch to remote mode or install js-doc-store.");
        }
    }

    // Remote mode: Initialize API client
    let apiClient: ApiClient | undefined;
    if (modeConfig.mode === 'remote' && modeConfig.apiUrl) {
        apiClient = new ApiClient(modeConfig.apiUrl, modeConfig.token);
    }

    function getTable(name: string) {
        if (modeConfig.mode !== 'local') return null;
        if (tableCache.has(name)) return tableCache.get(name);
        const table = new jsDocStore.Table(db, name, { columns: [] });
        tableCache.set(name, table);
        return table;
    }

    // ============================================================================
    // DOCUMENT STORE TOOLS (Local + Remote)
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_mode",
        label: "Get Mode Info",
        description: "Returns the current operation mode (local or remote) and configuration.",
        parameters: Type.Object({}),
        async execute(_, __) {
            return {
                content: [{
                    type: "text",
                    text: `Mode: ${modeConfig.mode}\n${
                        modeConfig.mode === 'remote'
                            ? `API URL: ${modeConfig.apiUrl}\nAuthenticated: ${modeConfig.token ? 'Yes' : 'No'}`
                            : `Data Directory: ${DATA_DIR}`
                    }`
                }],
                details: modeConfig
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_create_table",
        label: "Create Architecture",
        description: "Defines a new data table/collection with a specific schema (columns, types, validation). Works in both local and remote modes.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Name of the table (e.g., 'crm_clients', 'wiki_pages')" }),
            columns: Type.Array({
                items: Type.Object({
                    name: Type.String({ description: "Column name" }),
                    type: Type.String({ description: "Type: text, number, checkbox, email, url, phone, select, multiselect, relation, json, attachment, autonumber" }),
                    required: Type.Optional(Type.Boolean({ description: "Is field mandatory?" })),
                    unique: Type.Optional(Type.Boolean({ description: "Must be unique?" })),
                    default: Type.Optional(Type.Any({ description: "Default value" })),
                    options: Type.Optional(Type.Array({ items: Type.String({ description: "Options for select/multiselect" }) }))
                })
            }, { description: "Column definitions" })
        }),
        async execute(_, params) {
            if (apiClient) {
                const result = await apiClient.createTable(params.tableName, params.columns);
                return {
                    content: [{ type: "text", text: `Architecture '${params.tableName}' created remotely.` }],
                    details: result
                };
            } else {
                const table = new jsDocStore.Table(db, params.tableName, { columns: params.columns });
                tableCache.set(params.tableName, table);
                db.flush();
                return {
                    content: [{ type: "text", text: `Architecture '${params.tableName}' created locally with ${params.columns.length} columns.` }],
                    details: { tableName: params.tableName }
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_insert",
        label: "Insert Data",
        description: "Inserts a document into a table. Validates against the schema if one exists.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Target table name" }),
            data: Type.Record(Type.String(), Type.Any(), { description: "The document to insert (key-value pairs)" })
        }),
        async execute(_, params) {
            if (apiClient) {
                const result = await apiClient.insert(params.tableName, params.data);
                return {
                    content: [{ type: "text", text: `Document inserted into ${params.tableName} remotely.` }],
                    details: result
                };
            } else {
                const table = getTable(params.tableName);
                const doc = table.insert(params.data);
                db.flush();
                return {
                    content: [{ type: "text", text: `Document inserted into ${params.tableName} with ID: ${doc._id}` }],
                    details: { id: doc._id }
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_query",
        label: "Query Data",
        description: "Search for documents using MongoDB-style filters.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Table to query" }),
            filter: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Query filter (e.g., { age: { $gte: 18 } })" })),
            sort: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal(1), Type.Literal(-1)]), { description: "Sort specification (e.g., { age: -1 })" })),
            limit: Type.Optional(Type.Number({ description: "Limit results" }))
        }),
        async execute(_, params) {
            if (apiClient) {
                const result = await apiClient.query(params.tableName, params.filter, params.sort, params.limit);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.data || result, null, 2) }],
                    details: { count: Array.isArray(result.data) ? result.data.length : 0 }
                };
            } else {
                const table = getTable(params.tableName);
                let query = table.find(params.filter || {});
                if (params.sort) query = query.sort(params.sort);
                if (params.limit) query = query.limit(params.limit);
                const results = query.toArray();
                return {
                    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
                    details: { count: results.length }
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_update",
        label: "Update Data",
        description: "Updates documents matching a filter using operators like $set, $inc, $push.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Target table" }),
            filter: Type.Record(Type.String(), Type.Any(), { description: "Filter for documents to update" }),
            update: Type.Record(Type.String(), Type.Any(), { description: "Update object with operators like { $set: {...} }" })
        }),
        async execute(_, params) {
            if (apiClient) {
                const result = await apiClient.update(params.tableName, params.filter, params.update);
                return {
                    content: [{ type: "text", text: `Documents in ${params.tableName} updated remotely.` }],
                    details: result
                };
            } else {
                const table = getTable(params.tableName);
                const count = table.updateMany(params.filter, params.update);
                db.flush();
                return {
                    content: [{ type: "text", text: `${count} document(s) in ${params.tableName} updated locally.` }]
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_remove",
        label: "Remove Data",
        description: "Removes documents matching a filter.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Target table" }),
            filter: Type.Record(Type.String(), Type.Any(), { description: "Filter for documents to remove" })
        }),
        async execute(_, params) {
            if (apiClient) {
                const result = await apiClient.remove(params.tableName, params.filter);
                return {
                    content: [{ type: "text", text: `Documents removed from ${params.tableName} remotely.` }],
                    details: result
                };
            } else {
                const table = getTable(params.tableName);
                const count = table.remove(params.filter);
                db.flush();
                return {
                    content: [{ type: "text", text: `${count} document(s) removed from ${params.tableName} locally.` }]
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_aggregate",
        label: "Aggregate Data",
        description: "Perform complex data analysis: group by, sum, avg, and joins (lookup).",
        parameters: Type.Object({
            tableName: Type.String({ description: "Source table" }),
            pipeline: Type.Array(Type.Object({
                stage: Type.String({ description: "Stage: match, lookup, group, sort, limit, project, unwind" }),
                params: Type.Record(Type.String(), Type.Any(), { description: "Parameters for the stage" })
            }), { description: "Aggregation pipeline stages" })
        }),
        async execute(_, params) {
            if (apiClient) {
                const result = await apiClient.aggregate(params.tableName, params.pipeline);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.data || result, null, 2) }],
                    details: result
                };
            } else {
                const table = getTable(params.tableName);
                let agg = table.aggregate();
                for (const step of params.pipeline) {
                    if (step.stage === 'match') agg = agg.match(step.params);
                    else if (step.stage === 'lookup') agg = agg.lookup(step.params);
                    else if (step.stage === 'group') agg = agg.group(step.params.field, step.params.accumulators);
                    else if (step.stage === 'sort') agg = agg.sort(step.params);
                    else if (step.stage === 'limit') agg = agg.limit(step.params);
                    else if (step.stage === 'project') agg = agg.project(step.params);
                    else if (step.stage === 'unwind') agg = agg.unwind(step.params);
                }
                const results = agg.toArray();
                return {
                    content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_list_tables",
        label: "List Architectures",
        description: "Lists all data structures (tables) available.",
        parameters: Type.Object({}),
        async execute(_, __) {
            if (apiClient) {
                const result = await apiClient.listTables();
                const tables = result.tables || [];
                return {
                    content: [{ type: "text", text: `Available architectures: ${tables.join(', ') || 'None'}` }],
                    details: { tables }
                };
            } else {
                const files = fs.readdirSync(DATA_DIR);
                const tables = [...new Set(files.filter(f => f.endsWith('.docs.json')).map(f => f.replace('.docs.json', '')))];
                return {
                    content: [{ type: "text", text: `Local architectures: ${tables.join(', ') || 'None'}` }],
                    details: { tables }
                };
            }
        }
    }));

    // ============================================================================
    // REASONING TREE TOOLS (RAG Without Vectors)
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_tree_navigate",
        label: "Tree Navigation (RAG)",
        description: "Navigate hierarchical Reasoning Tree for RAG retrieval. Descends from root → branch → leaf, assembling full context (summaries + content). No vectors required.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Table containing the tree structure" }),
            rootId: Type.Optional(Type.String({ description: "Starting root node ID (default: find by keyword)" })),
            keyword: Type.Optional(Type.String({ description: "Keyword to search in summaries for navigation" })),
            maxDepth: Type.Optional(Type.Number({ description: "Maximum depth to traverse (default: 5)" }))
        }),
        async execute(_, params) {
            const { tableName, rootId, keyword, maxDepth = 5 } = params;

            async function getNode(nodeId: string) {
                if (apiClient) {
                    const result = await apiClient.query(tableName, { _id: nodeId }, undefined, 1);
                    const data = result.data || result;
                    return Array.isArray(data) ? data[0] : data;
                } else {
                    const table = getTable(tableName);
                    return table.find({ _id: nodeId }).toArray()[0];
                }
            }

            async function getChildren(parentId: string | null) {
                if (apiClient) {
                    const result = await apiClient.query(tableName, { parent_id: parentId });
                    return result.data || result || [];
                } else {
                    const table = getTable(tableName);
                    return table.find({ parent_id: parentId }).toArray();
                }
            }

            // Find root if not specified
            let currentRoot = rootId;
            if (!currentRoot) {
                const roots = await getChildren(null);
                if (keyword) {
                    currentRoot = roots.find((r: any) =>
                        r.summary?.toLowerCase().includes(keyword.toLowerCase()) ||
                        r.title?.toLowerCase().includes(keyword.toLowerCase())
                    )?._id;
                }
                if (!currentRoot && roots.length > 0) {
                    currentRoot = roots[0]._id;
                }
            }

            if (!currentRoot) {
                return {
                    content: [{ type: "text", text: "No root node found for navigation." }],
                    isError: true
                };
            }

            // Navigate tree and build context
            const navigationPath: any[] = [];
            let currentNode = await getNode(currentRoot);
            let depth = 0;

            while (currentNode && depth < maxDepth) {
                navigationPath.push({
                    level: currentNode.level || depth,
                    id: currentNode._id,
                    title: currentNode.title,
                    summary: currentNode.summary,
                    content: currentNode.content
                });

                // Find most relevant child based on keyword
                const children = await getChildren(currentNode._id);
                if (children.length === 0) break;

                if (keyword) {
                    const matchedChild = children.find((c: any) =>
                        c.summary?.toLowerCase().includes(keyword.toLowerCase()) ||
                        c.title?.toLowerCase().includes(keyword.toLowerCase())
                    );
                    currentNode = matchedChild || children[0];
                } else {
                    currentNode = children[0];
                }
                depth++;
            }

            // Assemble RAG context
            const root = navigationPath[0];
            const leaf = navigationPath[navigationPath.length - 1];
            const context = {
                root_summary: root?.summary,
                branch_summaries: navigationPath.slice(1, -1).map((n: any) => n.summary).join(' → '),
                leaf_content: leaf?.content,
                full_path: navigationPath.map((n: any) => n.title).join(' → '),
                all_nodes: navigationPath
            };

            return {
                content: [{
                    type: "text",
                    text: `RAG Context Retrieved:\n\n` +
                          `**Root:** ${root?.summary}\n\n` +
                          `**Path:** ${context.full_path}\n\n` +
                          `**Content:**\n${leaf?.content || 'No content at leaf'}\n\n` +
                          `**Full Context for LLM:**\n${JSON.stringify(context, null, 2)}`
                }],
                details: context
            };
        }
    }));

    // ============================================================================
    // VECTOR SEARCH TOOLS (Remote mode only)
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_vector_index",
        label: "Vector Index",
        description: "Indexes a document with its embedding vector for semantic search. Remote API mode only.",
        parameters: Type.Object({
            collection: Type.String({ description: "Vector collection name (e.g., 'articles', 'docs')" }),
            id: Type.String({ description: "Document ID" }),
            vector: Type.Array(Type.Number(), { description: "Embedding vector (array of floats, typically 768 dimensions from models like Gemma 300M)" }),
            text: Type.Optional(Type.String({ description: "Original text for BM25 hybrid indexing" })),
            metadata: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Additional metadata (title, author, etc.)" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Vector search requires remote API mode. Set dataArchitectMode to 'remote' in settings." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorIndex(params.collection, params.id, params.vector, params.metadata, params.text);
            return {
                content: [{ type: "text", text: `Vector indexed in collection '${params.collection}' with ID: ${params.id}` }],
                details: result
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_batch",
        label: "Vector Batch Index",
        description: "Batch index multiple vectors at once. Remote API mode only.",
        parameters: Type.Object({
            collection: Type.String({ description: "Vector collection name" }),
            vectors: Type.Array(Type.Object({
                id: Type.String({ description: "Document ID" }),
                vector: Type.Array(Type.Number(), { description: "Embedding vector" }),
                metadata: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Metadata" }))
            }), { description: "Array of vectors to index" })
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Vector search requires remote API mode." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorBatch(params.collection, params.vectors);
            return {
                content: [{ type: "text", text: `${result.indexed || params.vectors.length} vectors indexed in collection '${params.collection}'` }],
                details: result
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_search",
        label: "Vector Search",
        description: "Semantic search using embedding vectors. Finds documents by semantic similarity. Remote API only.",
        parameters: Type.Object({
            collection: Type.String({ description: "Vector collection to search" }),
            vector: Type.Array(Type.Number(), { description: "Query embedding vector" }),
            limit: Type.Optional(Type.Number({ description: "Max results (default: 10)" })),
            metric: Type.Optional(Type.String({ description: "Distance metric: cosine (default), euclidean, dotProduct, manhattan" })),
            matryoshka: Type.Optional(Type.Array(Type.Number(), { description: "Multi-stage dimensions for progressive filtering, e.g., [128, 384, 768]" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Vector search requires remote API mode." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorSearch(
                params.collection,
                params.vector,
                params.limit,
                params.metric,
                params.matryoshka
            );
            const data = result.data || [];
            const text = data.map((r: any, i: number) =>
                `${i + 1}. [${(r.score || 0).toFixed(4)}] ${r.id}${r.metadata?.title ? ' - ' + r.metadata.title : ''}`
            ).join('\n');
            return {
                content: [{ type: "text", text: text || "No results found." }],
                details: { results: data, count: data.length }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_search_hybrid",
        label: "Hybrid Search (Vector + Text)",
        description: "Combines vector similarity with BM25 text relevance for better results. Uses Reciprocal Rank Fusion (RRF). Remote API only.",
        parameters: Type.Object({
            collection: Type.String({ description: "Vector collection to search" }),
            vector: Type.Array(Type.Number(), { description: "Query embedding vector" }),
            text: Type.String({ description: "Query text for BM25" }),
            limit: Type.Optional(Type.Number({ description: "Max results (default: 10)" })),
            mode: Type.Optional(Type.String({ description: "Fusion mode: rrf (default) or weighted" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Hybrid search requires remote API mode." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorSearchHybrid(
                params.collection,
                params.vector,
                params.text,
                params.limit,
                params.mode
            );
            const data = result.data || [];
            const text = data.map((r: any, i: number) =>
                `${i + 1}. [${(r.score || 0).toFixed(4)}] ${r.id}${r.metadata?.title ? ' - ' + r.metadata.title : ''}`
            ).join('\n');
            return {
                content: [{ type: "text", text: text || "No results found." }],
                details: { results: data, count: data.length }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_search_cross",
        label: "Cross-Collection Search",
        description: "Search across multiple vector collections with score normalization. Remote API only.",
        parameters: Type.Object({
            collections: Type.Array(Type.String(), { description: "List of collection names to search" }),
            vector: Type.Array(Type.Number(), { description: "Query embedding vector" }),
            limit: Type.Optional(Type.Number({ description: "Max results (default: 10)" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Cross-collection search requires remote API mode." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorSearchCross(params.collections, params.vector, params.limit);
            const data = result.data || [];
            const text = data.map((r: any, i: number) =>
                `${i + 1}. [${(r.score || 0).toFixed(4)}] ${r.id} (${r.collection || 'unknown'})`
            ).join('\n');
            return {
                content: [{ type: "text", text: text || "No results found." }],
                details: { results: data, count: data.length }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_collections",
        label: "List Vector Collections",
        description: "Lists all vector collections with document counts. Remote API only.",
        parameters: Type.Object({}),
        async execute(_, __) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Remote API mode required." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorCollections();
            const collections = result.collections || [];
            const text = collections.map((c: any) =>
                `- ${c.name}: ${c.count} vectors`
            ).join('\n');
            return {
                content: [{ type: "text", text: text || "No vector collections found." }],
                details: { collections }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_delete",
        label: "Delete Vector",
        description: "Removes a vector from the index by ID. Remote API only.",
        parameters: Type.Object({
            collection: Type.String({ description: "Vector collection name" }),
            id: Type.String({ description: "Document ID to remove" })
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Remote API mode required." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorDelete(params.collection, params.id);
            return {
                content: [{ type: "text", text: `Vector ${params.id} removed from collection '${params.collection}'.` }],
                details: result
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_vector_drop",
        label: "Drop Vector Collection",
        description: "Deletes an entire vector collection. WARNING: This cannot be undone. Remote API only.",
        parameters: Type.Object({
            collection: Type.String({ description: "Vector collection name to delete" })
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Remote API mode required." }],
                    isError: true
                };
            }
            const result = await apiClient.vectorDrop(params.collection);
            return {
                content: [{ type: "text", text: `Vector collection '${params.collection}' has been dropped.` }],
                details: result
            };
        }
    }));

    // ============================================================================
    // SKILL REGISTRY TOOLS (Remote mode only)
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_skill_register",
        label: "Register Skill from File",
        description: "Reads a SKILL.md file and registers it in the dynamic skill registry table. Remote API mode only.",
        parameters: Type.Object({
            filePath: Type.String({ description: "Path to the SKILL.md file" }),
            name: Type.String({ description: "Skill identifier (e.g., 'vps-management')" }),
            version: Type.Optional(Type.String({ description: "Semantic version (default: 1.0.0)" })),
            tags: Type.Optional(Type.String({ description: "Comma-separated tags for discovery" })),
            description: Type.Optional(Type.String({ description: "Brief description for listings" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Skill registry requires remote API mode." }],
                    isError: true
                };
            }

            const fs = require('fs');
            const path = require('path');

            if (!fs.existsSync(params.filePath)) {
                return {
                    content: [{ type: "text", text: `File not found: ${params.filePath}` }],
                    isError: true
                };
            }

            const content = fs.readFileSync(params.filePath, 'utf-8');
            const titleMatch = content.match(/^# (.+)$/m);
            const name = params.name || path.basename(path.dirname(params.filePath));
            const version = params.version || '1.0.0';
            const tags = params.tags || name;
            const description = params.description || (titleMatch ? titleMatch[1] : name);

            const result = await apiClient.insert('skills', {
                name,
                version,
                tags,
                description,
                content
            });

            return {
                content: [{ type: "text", text: `Skill '${name}' registered as version ${version}.` }],
                details: { id: result.id, name, version }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_skill_discover",
        label: "Discover Skills by Tag",
        description: "Query the skill registry by tags to find relevant skills. Returns name, version, and description (not full content).",
        parameters: Type.Object({
            tagQuery: Type.String({ description: "Tag or keyword to search for (e.g., 'vps', 'crm', 'rag')" }),
            limit: Type.Optional(Type.Number({ description: "Max results (default: 10)" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Skill discovery requires remote API mode." }],
                    isError: true
                };
            }

            const result = await apiClient.query(
                'skills',
                { tags: { $regex: params.tagQuery } },
                undefined,
                params.limit || 10
            );

            const data = result.data || [];
            const text = data.map((s: any, i: number) =>
                `${i + 1}. ${s.name} v${s.version}\n   ${s.description}`
            ).join('\n');

            return {
                content: [{ type: "text", text: text || `No skills found for tag '${params.tagQuery}'.` }],
                details: { count: data.length, skills: data.map((s: any) => ({ name: s.name, version: s.version, tags: s.tags, description: s.description })) }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_skill_load",
        label: "Load Skill Content",
        description: "Retrieve the full content (SKILL.md text) of a skill by name for context injection.",
        parameters: Type.Object({
            name: Type.String({ description: "Skill name (e.g., 'data-architect')" })
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Skill loading requires remote API mode." }],
                    isError: true
                };
            }

            const result = await apiClient.query('skills', { name: params.name }, undefined, 1);
            const data = result.data || [];

            if (data.length === 0) {
                return {
                    content: [{ type: "text", text: `Skill '${params.name}' not found in registry.` }],
                    isError: true
                };
            }

            const skill = data[0];
            return {
                content: [{ type: "text", text: skill.content }],
                details: { name: skill.name, version: skill.version, tags: skill.tags, contentLength: skill.content.length }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_skill_create_table",
        label: "Create Skill Registry Table",
        description: "Creates the 'skills' table in js-doc-store-server if it doesn't exist. Required before registering skills.",
        parameters: Type.Object({}),
        async execute(_, __) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Remote API mode required." }],
                    isError: true
                };
            }

            const result = await apiClient.createTable('skills', [
                { name: 'name', type: 'text', required: true },
                { name: 'version', type: 'text' },
                { name: 'tags', type: 'text' },
                { name: 'description', type: 'text' },
                { name: 'content', type: 'text', required: true }
            ]);

            return {
                content: [{ type: "text", text: "Skill registry table 'skills' created (or already exists)." }],
                details: result
            };
        }
    }));
}
