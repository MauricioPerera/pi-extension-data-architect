/**
 * Bootstrap Script for pi-extension-data-architect
 * 
 * Run this ONCE after installing the extension to initialize the skill registry.
 * It ensures the 'skills' table exists and registers all built-in extension skills.
 * 
 * Usage:
 *   node scripts/bootstrap.js http://localhost:3000 YOUR_JWT_TOKEN
 * 
 * Or set environment variables:
 *   JS_DOC_STORE_API_URL=http://localhost:3000
 *   JS_DOC_STORE_TOKEN=your-jwt-token
 *   node scripts/bootstrap.js
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_API_URL = 'http://localhost:3000';

class ApiClient {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }

    async request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return res.json();
    }

    async createTable(tableName, columns) {
        return this.request('POST', '/admin/create-table', { tableName, columns });
    }

    async query(tableName, filter, sort, limit) {
        return this.request('POST', '/admin/query', { tableName, filter, sort, limit });
    }

    async insert(tableName, data) {
        return this.request('POST', '/admin/insert', { tableName, data });
    }
}

async function checkServer(client) {
    try {
        const res = await fetch(`${client.baseUrl}/auth/health`);
        if (res.ok) return true;
    } catch {
        // fall through
    }
    try {
        const res = await fetch(`${client.baseUrl}/public/tables`);
        if (res.ok) return true;
    } catch {
        // fall through
    }
    return false;
}

async function tableExists(client, tableName) {
    try {
        const result = await client.query(tableName, {}, undefined, 1);
        return result && (result.data !== undefined || result.success !== false);
    } catch {
        return false;
    }
}

async function skillExists(client, name) {
    try {
        const result = await client.query('skills', { name });
        return result.data && result.data.length > 0;
    } catch {
        return false;
    }
}

async function ensureSkillsTable(client) {
    if (await tableExists(client, 'skills')) {
        console.log('✅ Table "skills" already exists.');
        return;
    }

    console.log('Creating table "skills"...');
    const result = await client.createTable('skills', [
        { name: 'name', type: 'text', required: true },
        { name: 'version', type: 'text' },
        { name: 'tags', type: 'text' },
        { name: 'description', type: 'text' },
        { name: 'content', type: 'text', required: true }
    ]);
    console.log(result.success ? '✅ Table created.' : `⚠️ ${result.message || 'Unknown result'}`);
}

async function registerSkill(client, name, version, tags, description, skillDir) {
    if (await skillExists(client, name)) {
        console.log(`⏭️  Skill "${name}" already registered.`);
        return;
    }

    const skillFile = path.join(__dirname, '..', 'skills', skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
        console.error(`❌ Skill file not found: ${skillFile}`);
        return;
    }

    const content = fs.readFileSync(skillFile, 'utf-8');
    console.log(`Registering "${name}"...`);
    const result = await client.insert('skills', {
        name,
        version,
        tags,
        description,
        content
    });
    console.log(result.success ? `✅ Registered: ${name}` : `❌ Failed: ${name}`);
}

async function main() {
    let apiUrl = process.env.JS_DOC_STORE_API_URL || process.argv[2] || DEFAULT_API_URL;
    let token = process.env.JS_DOC_STORE_TOKEN || process.argv[3];

    if (!token) {
        console.error(`
❌ Missing JWT token.

Usage:
  node scripts/bootstrap.js <API_URL> <JWT_TOKEN>

Or set environment variables:
  export JS_DOC_STORE_API_URL=http://localhost:3000
  export JS_DOC_STORE_TOKEN=your-jwt-token
  node scripts/bootstrap.js

To get a token, run on your js-doc-store-server:
  curl -X POST http://localhost:3000/auth/login \\
    -H "Content-Type: application/json" \\
    -d '{"email":"admin@example.com","password":"Admin123!"}'
`);
        process.exit(1);
    }

    console.log(`Connecting to: ${apiUrl}`);
    const client = new ApiClient(apiUrl, token);

    console.log('Checking server health...');
    const alive = await checkServer(client);
    if (!alive) {
        console.error(`
❌ Cannot connect to js-doc-store-server at ${apiUrl}

Make sure the server is running:
  cd js-doc-store-server
  node server.js

Or if using the daemon:
  node daemon.js start
`);
        process.exit(1);
    }
    console.log('✅ Server is reachable.\n');

    await ensureSkillsTable(client);
    console.log('');

    const skillsToRegister = [
        {
            name: 'data-architect',
            version: '2.0.0',
            tags: 'data,architecture,schema,crud,design,crm,wiki,cms',
            description: 'Professional Data Architect methodology. Includes entity analysis, schema design, implementation workflow, and prebuilt patterns (CRM, Wiki, Inventory).',
            dir: 'data-architect'
        },
        {
            name: 'tree-operator',
            version: '2.0.0',
            tags: 'rag,tree,reasoning,knowledge,hierarchy,navigation,semantic',
            description: 'RAG without embeddings using hierarchical Reasoning Trees. Navigate Root→Branch→Leaf, maintain summaries, and retrieve via structure rather than vectors.',
            dir: 'tree-operator'
        },
        {
            name: 'skill-registry',
            version: '2.1.0',
            tags: 'skills,registry,discovery,meta-pattern,architecture',
            description: 'Meta-skill pattern for dynamic skill discovery. Keep only ONE SKILL.md on filesystem; query all specialized skills on-demand from js-doc-store-server by tags.',
            dir: 'skill-registry'
        }
    ];

    for (const skill of skillsToRegister) {
        await registerSkill(client, skill.name, skill.version, skill.tags, skill.description, skill.dir);
    }

    console.log('\n🎉 Bootstrap complete!');
    console.log('\nNext steps:');
    console.log('  1. Keep only ONE skill on your filesystem: skill-discovery/SKILL.md');
    console.log('  2. Delete duplicate skills that are now in the registry');
    console.log('  3. Future sessions: Pi loads skill-discovery → queries DB → injects context');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
