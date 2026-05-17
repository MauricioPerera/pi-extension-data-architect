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
import { spawn } from "node:child_process";
import fs from "fs";
import path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.pi', 'agent', 'dynamic-data');
const DEFAULT_API_URL = 'http://localhost:3000'; // Configure via Pi settings or env

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

    private getSettingsPath(): string {
        const home = process.env.HOME || process.env.USERPROFILE || '.';
        return path.join(home, '.pi', 'agent', 'settings.json');
    }

    private async tryRefreshToken(): Promise<boolean> {
        try {
            const raw = fs.readFileSync(this.getSettingsPath(), 'utf-8');
            const settings = JSON.parse(raw);
            const email = settings.dataArchitectEmail;
            const password = settings.dataArchitectPassword;
            if (!email || !password) return false;

            const res = await fetch(`${this.baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) return false;

            const data = await res.json() as { token?: string };
            if (!data.token) return false;

            this.token = data.token;
            settings.dataArchitectApiToken = data.token;
            fs.writeFileSync(this.getSettingsPath(), JSON.stringify(settings, null, 2));
            return true;
        } catch { return false; }
    }

    private async request(method: string, endpoint: string, body?: any, isRetry = false): Promise<any> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        if (response.status === 401 && !isRetry) {
            const refreshed = await this.tryRefreshToken();
            if (refreshed) return this.request(method, endpoint, body, true);
        }

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

    async vaultGet(secretId: string) {
        return this.request('POST', '/admin/vault/get', { secretId });
    }

    async connectionsList() {
        return this.request('POST', '/admin/connections/list', {});
    }

    async connectionsRegister(connection: { name: string; host: string; port: number; username: string; vaultSecretId: string; label?: string }) {
        return this.request('POST', '/admin/connections/register', connection);
    }

    // Public
    async listTables() {
        return this.request('GET', '/public/tables');
    }
}

// ============================================================================
// CLOUDFLARE AUTH HELPERS
// ============================================================================

function getCloudflareToken(): string | null {
    // 1. Direct env var
    if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
    if (process.env.WRANGLER_API_TOKEN) return process.env.WRANGLER_API_TOKEN;

    // 2. Read from wrangler config
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(os.homedir(), '.wrangler', 'config', 'default.toml');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const match = content.match(/^oauth_token\s*=\s*"(.+)"$/m);
            if (match) return match[1].trim();
        }
    } catch { /* ignore */ }

    return null;
}

function getCloudflareAccountId(): string | null {
    if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
    // Try to infer from wrangler whoami output cached
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const whoamiPath = path.join(os.homedir(), '.wrangler', 'whoami.json');
        if (fs.existsSync(whoamiPath)) {
            const json = JSON.parse(fs.readFileSync(whoamiPath, 'utf-8'));
            return json.account_id || json.accountId || null;
        }
    } catch { /* ignore */ }
    return null;
}

// ============================================================================
// CLOUDFLARE MCP CLIENT (Code Mode)
// ============================================================================

class CloudflareMCPClient {
    private baseUrl = 'https://mcp.cloudflare.com/mcp';
    private sessionId: string | null = null;
    private initialized = false;

    constructor(private apiToken: string) {}

    private async mcpRequest(body: any): Promise<any> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Bearer ${this.apiToken}`
        };
        if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
        }

        const resp = await fetch(this.baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const sess = resp.headers.get('mcp-session-id');
        if (sess) this.sessionId = sess;

        const text = await resp.text();
        if (!resp.ok) throw new Error(`MCP error ${resp.status}: ${text}`);

        try { return JSON.parse(text); }
        catch { return { text, ok: resp.ok }; }
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        const init = await this.mcpRequest({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: { sampling: {}, roots: { listChanged: true } },
                clientInfo: { name: 'pi-extension-data-architect', version: '2.2.0' }
            }
        });

        if (init.error) throw new Error(`MCP init failed: ${init.error.message}`);

        await this.mcpRequest({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {}
        });

        this.initialized = true;
    }

    async callTool(name: string, args: Record<string, any>): Promise<any> {
        await this.initialize();

        const result = await this.mcpRequest({
            jsonrpc: '2.0',
            id: Math.floor(Math.random() * 1000000),
            method: 'tools/call',
            params: { name, arguments: args }
        });

        if (result.error) throw new Error(`Tool error: ${result.error.message}`);
        return result.result;
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

    // ============================================================================
    // CONVERSATION MEMORY TOOLS (Remote mode only)
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_message_save",
        label: "Save Message",
        description: "Persists a conversation message to the 'messages' table. Enables full history recovery after context compaction. Remote API only.",
        parameters: Type.Object({
            conversationId: Type.String({ description: "Unique conversation/session identifier" }),
            role: Type.String({ description: "Role: 'user', 'assistant', or 'system'" }),
            content: Type.String({ description: "Message content" }),
            turn: Type.Optional(Type.Number({ description: "Turn number (auto-incremented if omitted)" })),
            model: Type.Optional(Type.String({ description: "Model name (e.g., 'claude-sonnet')" })),
            toolCalls: Type.Optional(Type.String({ description: "JSON-serialized tool calls if any" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Conversation memory requires remote API mode." }],
                    isError: true
                };
            }

            let turn = params.turn;
            if (turn === undefined) {
                try {
                    const prev = await apiClient.query(
                        'messages',
                        { conversation_id: params.conversationId },
                        { turn: -1 },
                        1
                    );
                    const data = prev.data || [];
                    turn = data.length > 0 ? (data[0].turn || 0) + 1 : 1;
                } catch {
                    turn = 1;
                }
            }

            const result = await apiClient.insert('messages', {
                conversation_id: params.conversationId,
                turn,
                role: params.role,
                content: params.content,
                timestamp: new Date().toISOString(),
                model: params.model || null,
                tool_calls: params.toolCalls || null
            });

            return {
                content: [{ type: "text", text: `Message saved (turn ${turn}, ${params.role}).` }],
                details: { id: result.id, turn, conversationId: params.conversationId }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_message_history",
        label: "Get Conversation History",
        description: "Retrieves full message history for a conversation. Use after compaction to recover context beyond the summary. Remote API only.",
        parameters: Type.Object({
            conversationId: Type.String({ description: "Conversation identifier" }),
            limit: Type.Optional(Type.Number({ description: "Max messages (default: 100)" }))
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Conversation memory requires remote API mode." }],
                    isError: true
                };
            }

            const result = await apiClient.query(
                'messages',
                { conversation_id: params.conversationId },
                { turn: 1 },
                params.limit || 100
            );

            const data = result.data || [];
            const lines = data.map((m: any) =>
                `[T${m.turn}] ${m.role}: ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}`
            ).join('\n');

            return {
                content: [{ type: "text", text: lines || `No messages found for conversation '${params.conversationId}'.` }],
                details: { count: data.length, conversationId: params.conversationId }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_conversations",
        label: "List Conversations",
        description: "Lists all unique conversation IDs stored in the messages table with message counts. Remote API only.",
        parameters: Type.Object({}),
        async execute(_, __) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Conversation memory requires remote API mode." }],
                    isError: true
                };
            }

            const result = await apiClient.query('messages', {}, undefined, 1000);
            const data = result.data || [];

            const grouped: Record<string, number> = {};
            for (const m of data) {
                const cid = m.conversation_id;
                grouped[cid] = (grouped[cid] || 0) + 1;
            }

            const lines = Object.entries(grouped)
                .map(([cid, count]) => `- ${cid}: ${count} messages`)
                .join('\n');

            return {
                content: [{ type: "text", text: lines || 'No conversations found.' }],
                details: { conversations: Object.keys(grouped), totalMessages: data.length }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_message_create_table",
        label: "Create Messages Table",
        description: "Creates the 'messages' table for conversation persistence. Run once before saving messages. Remote API only.",
        parameters: Type.Object({}),
        async execute(_, __) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "Remote API mode required." }],
                    isError: true
                };
            }

            const result = await apiClient.createTable('messages', [
                { name: 'conversation_id', type: 'text', required: true },
                { name: 'turn', type: 'number' },
                { name: 'role', type: 'text', required: true },
                { name: 'content', type: 'text', required: true },
                { name: 'timestamp', type: 'text' },
                { name: 'model', type: 'text' },
                { name: 'tool_calls', type: 'text' }
            ]);

            return {
                content: [{ type: "text", text: 'Messages table created (or already exists).' }],
                details: result
            };
        }
    }));

    // ============================================================================
    // CLOUDFLARE MCP TOOLS
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_cf_mcp_search",
        label: "Cloudflare MCP Search",
        description: "Busca endpoints en la API de Cloudflare escribiendo JavaScript contra el spec OpenAPI. Usa el MCP server de Cloudflare en Code Mode. Requiere CLOUDFLARE_API_TOKEN en env o settings.",
        parameters: Type.Object({
            code: Type.String({ description: "Código JS async que explora spec.paths. Ej: async () => { const results = []; for (const [path, methods] of Object.entries(spec.paths)) { if (path.includes('/workers')) results.push(path); } return results; }" }),
            account_id: Type.Optional(Type.String({ description: "Cloudflare account ID (opcional, se autodetecta desde wrangler si está logueado)" }))
        }),
        async execute(params, _) {
            const token = getCloudflareToken() || pi.settings?.get?.('cloudflareApiToken');
            const autoAccountId = getCloudflareAccountId();
            if (!token) {
                return {
                    content: [{ type: "text", text: "Falta CLOUDFLARE_API_TOKEN. Wrangler está autenticado? Ejecutá `wrangler login` para obtener OAuth token, o configurá CLOUDFLARE_API_TOKEN en env." }],
                    isError: true
                };
            }

            try {
                const mcp = new CloudflareMCPClient(token);
                const result = await mcp.callTool('search', {
                    code: params.code,
                    ...(params.account_id ? { account_id: params.account_id } : (autoAccountId ? { account_id: autoAccountId } : {}))
                });

                const content = result?.content || [];
                const text = content.map((c: any) => c.text).join('\n') || JSON.stringify(result, null, 2);

                return {
                    content: [{ type: "text", text: `Cloudflare MCP Search result:\n\n${text}` }],
                    details: result
                };
            } catch (e: any) {
                return {
                    content: [{ type: "text", text: `Error MCP: ${e.message}` }],
                    isError: true
                };
            }
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_cf_embed",
        label: "Cloudflare Workers AI Embed",
        description: "Genera embeddings usando Workers AI (Gemma embedding) via un Worker privado. Requiere GEMMA_EMBED_URL y GEMMA_EMBED_API_KEY en variables de entorno. Soporta Matryoshka y cuantización binaria.",
        parameters: Type.Object({
            text: Type.String({ description: "Texto a vectorizar" }),
            texts: Type.Optional(Type.Array(Type.String(), { description: "Array de textos (batch)" })),
            dimensions: Type.Optional(Type.Number({ description: "Dimensiones Matryoshka (64, 128, 256, 512, 768, 1024, 1536, 2048). Default: 768" })),
            normalize: Type.Optional(Type.Boolean({ description: "Normalizar vectores (default: true)" })),
            binary: Type.Optional(Type.Boolean({ description: "Incluir cuantización binaria (default: true)" })),
            endpoint: Type.Optional(Type.String({ description: "Sobrescribe GEMMA_EMBED_URL (ruta relativa: /embed, /embed/matryoshka, /embed/multilingual)" }))
        }),
        async execute(params, _) {
            const embedUrl = process.env.GEMMA_EMBED_URL || pi.settings?.get?.('gemmaEmbedUrl');
            const apiKey = process.env.GEMMA_EMBED_API_KEY || pi.settings?.get?.('gemmaEmbedApiKey');

            if (!embedUrl || !apiKey) {
                return {
                    content: [{ type: "text", text: "Faltan credenciales de embedding. Configurá GEMMA_EMBED_URL y GEMMA_EMBED_API_KEY en env o settings de Pi." }],
                    isError: true
                };
            }

            const path = params.endpoint || (params.dimensions ? '/embed/matryoshka' : '/embed');
            const url = embedUrl.replace(/\/$/, '') + path;

            const body: any = {};
            if (params.texts) body.texts = params.texts;
            else body.text = params.text;
            if (params.dimensions) body.dimensions = params.dimensions;
            if (params.normalize !== undefined) body.normalize = params.normalize;
            if (params.binary !== undefined) body.binary = params.binary;

            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });

                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    return {
                        content: [{ type: "text", text: `Error ${resp.status}: ${data.message || data.error || 'Embedding request failed'}` }],
                        isError: true
                    };
                }

                const vecs = data.embeddings || [];
                const summary = vecs.map((v: any) => `  - "${v.text?.substring(0, 40)}..." → [${v.dimensions} dims]${v.binary ? ' + binary' : ''}`).join('\n');

                return {
                    content: [{ type: "text", text: `Embeddings generados: ${data.count}\nModelo: ${data.model || 'N/A'}\nDimensions: ${data.dimensions || data.matryoshkaDimensions || 'N/A'}\n${summary}` }],
                    details: data
                };
            } catch (e: any) {
                return {
                    content: [{ type: "text", text: `Error de conexión: ${e.message}` }],
                    isError: true
                };
            }
        }
    }));

    // ============================================================================
    // VPS CONNECTION TOOLS (Local SSH execution, remote credential vault)
    // ============================================================================

    pi.registerTool(defineTool({
        name: "arch_vps_list",
        label: "List VPS Connections",
        description: "Lists all registered VPS/SSH connections stored on the remote server (metadata only, no secrets exposed).",
        parameters: Type.Object({}),
        async execute(_, __) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "VPS management requires remote API mode." }],
                    isError: true
                };
            }
            const result = await apiClient.connectionsList();
            const connections = result.connections || [];
            const text = connections.map((c: any) =>
                `- ${c.name} (${c.label || 'no label'})\n  Host: ${c.host}:${c.port || 22}\n  User: ${c.username}`
            ).join('\n');
            return {
                content: [{ type: "text", text: text || "No connections registered." }],
                details: { connections }
            };
        }
    }));

    // ============================================================================
    // SERVER AUTO-START (Remote mode: spawn server on session_start if unreachable)
    // ============================================================================

    if (modeConfig.mode === 'remote' && modeConfig.apiUrl && typeof (pi as any).on === 'function') {
        (pi as any).on('session_start', async (_event: any, ctx: any) => {
            try {
                const res = await fetch(`${modeConfig.apiUrl}/health`, {
                    signal: AbortSignal.timeout(2000)
                });
                if (res.ok) return; // Already running
            } catch { /* not running */ }

            const serverCmd = getSetting('dataArchitectServerCmd', '');
            if (!serverCmd) return;

            try {
                const parts = serverCmd.split(/\s+/);
                const proc = spawn(parts[0], parts.slice(1), {
                    detached: true,
                    stdio: 'ignore',
                    shell: process.platform === 'win32',
                });
                proc.unref();
                if (ctx?.hasUI) {
                    ctx.ui.notify('Data architect server starting...', 'info');
                }
            } catch { /* ignore spawn errors */ }
        });
    }

    pi.registerTool(defineTool({
        name: "arch_vps_connect",
        label: "Connect to VPS",
        description: "Fetches credentials from the server vault and executes an SSH command on the target VPS locally. The password is never exposed in output.",
        parameters: Type.Object({
            name: Type.String({ description: "Connection name (registered on server)" }),
            command: Type.String({ description: "Shell command to execute on the remote host" })
        }),
        async execute(_, params) {
            if (!apiClient) {
                return {
                    content: [{ type: "text", text: "VPS connection requires remote API mode." }],
                    isError: true
                };
            }

            try {
                // 1. Fetch connection metadata
                const listResult = await apiClient.connectionsList();
                const connections = listResult.connections || [];
                const connMeta = connections.find((c: any) => c.name === params.name);
                if (!connMeta) {
                    return {
                        content: [{ type: "text", text: `Connection '${params.name}' not found. Register it first using the server API.` }],
                        isError: true
                    };
                }

                // 2. Fetch secret from vault
                const vaultResult = await apiClient.vaultGet(connMeta.vaultSecretId);
                if (!vaultResult.success) {
                    return {
                        content: [{ type: "text", text: `Failed to retrieve vault secret: ${vaultResult.message}` }],
                        isError: true
                    };
                }
                const password = vaultResult.value;

                // 3. Execute SSH locally
                const { Client } = await import('ssh2');
                const client = new Client();

                const output = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
                    let stdout = '';
                    let stderr = '';
                    let code: number | null = null;

                    client.on('ready', () => {
                        client.exec(params.command, (err: any, stream: any) => {
                            if (err) {
                                client.end();
                                return reject(err);
                            }
                            stream.on('close', (exitCode: number | null) => {
                                code = exitCode;
                                client.end();
                                resolve({ stdout, stderr, code });
                            });
                            stream.on('data', (data: Buffer) => {
                                stdout += data.toString();
                            });
                            stream.stderr.on('data', (data: Buffer) => {
                                stderr += data.toString();
                            });
                        });
                    }).on('error', (err: any) => {
                        reject(err);
                    }).connect({
                        host: connMeta.host,
                        port: connMeta.port || 22,
                        username: connMeta.username,
                        password
                    });
                });

                return {
                    content: [{
                        type: "text",
                        text: `SSH to ${params.name} (${connMeta.host})\nExit code: ${output.code ?? 'N/A'}\n\nSTDOUT:\n${output.stdout || '(empty)'}\n\nSTDERR:\n${output.stderr || '(empty)'}`
                    }],
                    details: { host: connMeta.host, command: params.command, exitCode: output.code }
                };
            } catch (e: any) {
                return {
                    content: [{ type: "text", text: `SSH connection failed: ${e.message}` }],
                    isError: true
                };
            }
        }
    }));
}
