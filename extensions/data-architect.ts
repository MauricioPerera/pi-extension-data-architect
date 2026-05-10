/**
 * Data Architect Extension
 * 
 * Empowers the AI agent to autonomously design and manage data architectures
 * using js-doc-store. The agent can create CRMs, Wikis, CMSs, or any 
 * structured data system on the fly.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import fs from "fs";
import path from "path";

// For the published version, we assume js-doc-store is installed via npm
let jsDocStore;
try {
    jsDocStore = require("js-doc-store");
} catch (e) {
    console.error("js-doc-store is required for this extension to work.");
}

const { DocStore, FileStorageAdapter, Table } = jsDocStore;

// Default data directory if not specified in settings
const DEFAULT_DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.pi', 'agent', 'dynamic-data');

export default function dataArchitectExtension(pi: ExtensionAPI) {
    // Resolve data directory: settings file -> default
    const DATA_DIR = pi.settings.get('dataArchitectDir') || DEFAULT_DATA_DIR;

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Initialize the core DocStore with File Storage
    const db = new DocStore(new FileStorageAdapter(DATA_DIR));
    
    // Cache for Table instances to avoid re-creating them
    const tableCache = new Map<string, Table>();

    function getTable(name: string) {
        if (tableCache.has(name)) return tableCache.get(name);
        const table = new Table(db, name, { columns: [] }); 
        tableCache.set(name, table);
        return table;
    }

    // --- TOOLS ---

    pi.registerTool(defineTool({
        name: "arch_create_table",
        label: "Create Architecture",
        description: "Defines a new data table/collection with a specific schema (columns, types, validation).",
        parameters: Type.Object({
            tableName: Type.String({ description: "Name of the table (e.g., 'crm_clients', 'wiki_pages')" }),
            columns: Type.Array({
                items: Type.Object({
                    name: Type.String({ description: "Column name" }),
                    type: Type.String({ description: "Type: text, number, checkbox, email, url, phone, select, multiselect, relation, json, attachment, autonumber" }),
                    required: Type.Boolean({ description: "Is field mandatory?" }),
                    unique: Type.Boolean({ description: "Must be unique?" }),
                    default: Type.Any({ description: "Default value" }),
                    options: Type.Array({ items: Type.String({ description: "Options for select/multiselect" }) })
                })
            })
        }),
        async execute(_, params) {
            const table = new Table(db, params.tableName, { columns: params.columns });
            tableCache.set(params.tableName, table);
            db.flush();
            return {
                content: [{ type: "text", text: `Architecture '${params.tableName}' created successfully with ${params.columns.length} columns.` }],
                details: { tableName: params.tableName }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_insert",
        label: "Insert Data",
        description: "Inserts a document into a table. Validates against the schema if one exists.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Target table name" }),
            data: Type.Object({ description: "The document to insert" })
        }),
        async execute(_, params) {
            const table = getTable(params.tableName);
            const doc = table.insert(params.data);
            db.flush();
            return {
                content: [{ type: "text", text: `Document inserted into ${params.tableName} with ID: ${doc._id}` }],
                details: { id: doc._id }
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_query",
        label: "Query Data",
        description: "Search for documents using MongoDB-style filters.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Table to query" }),
            filter: Type.Object({ description: "Query filter (e.g., { age: { $gte: 18 } })" }),
            sort: Type.Object({ description: "Sort specification" }),
            limit: Type.Number({ description: "Limit results" })
        }),
        async execute(_, params) {
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
    }));

    pi.registerTool(defineTool({
        name: "arch_update",
        label: "Update Data",
        description: "Updates documents matching a filter using operators like $set, $inc, $push.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Target table" }),
            filter: Type.Object({ description: "Filter for documents to update" }),
            update: Type.Object({ description: "Update object" })
        }),
        async execute(_, params) {
            const table = getTable(params.tableName);
            table.updateMany(params.filter, params.update);
            db.flush();
            return {
                content: [{ type: "text", text: `Documents in ${params.tableName} updated successfully.` }]
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_aggregate",
        label: "Aggregate Data",
        description: "Perform complex data analysis: group by, sum, avg, and joins (lookup).",
        parameters: Type.Object({
            tableName: Type.String({ description: "Source table" }),
            pipeline: Type.Array({
                items: Type.Object({
                    stage: Type.String({ description: "Stage: match, lookup, group, sort, limit, project, unwind" }),
                    params: Type.Any({ description: "Parameters for the stage" })
                })
            })
        }),
        async execute(_, params) {
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
    }));

    pi.registerTool(defineTool({
        name: "arch_list_tables",
        label: "List Architectures",
        description: "Lists all data structures (tables) the agent has created.",
        async execute(_, __) {
            const files = fs.readdirSync(DATA_DIR);
            const tables = [...new Set(files.filter(f => f.endsWith('.docs.json')).map(f => f.replace('.docs.json', '')))];
            return {
                content: [{ type: "text", text: `Currently available architectures: ${tables.join(', ') || 'None'}` }]
            };
        }
    }));

    pi.registerTool(defineTool({
        name: "arch_get_schema",
        label: "Get Schema",
        description: "Returns the column definitions for a specific table.",
        parameters: Type.Object({
            tableName: Type.String({ description: "Table name" })
        }),
        async execute(_, params) {
            const table = getTable(params.tableName);
            return {
                content: [{ type: "text", text: JSON.stringify(table.getSchema(), null, 2) }]
            };
        }
    }));
}
