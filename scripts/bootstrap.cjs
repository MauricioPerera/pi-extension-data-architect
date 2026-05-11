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

async function ensureMessagesTable(client) {
    if (await tableExists(client, 'messages')) {
        console.log('✅ Table "messages" already exists.');
        return;
    }

    console.log('Creating table "messages"...');
    const result = await client.createTable('messages', [
        { name: 'conversation_id', type: 'text', required: true },
        { name: 'turn', type: 'number' },
        { name: 'role', type: 'text', required: true },
        { name: 'content', type: 'text', required: true },
        { name: 'timestamp', type: 'text' },
        { name: 'model', type: 'text' },
        { name: 'tool_calls', type: 'text' }
    ]);
    console.log(result.success ? '✅ Table created.' : `⚠️ ${result.message || 'Unknown result'}`);
}

// Parse YAML frontmatter from SKILL.md
function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return {};
    const lines = match[1].split('\n');
    const meta = {};
    let currentKey = null;
    for (const line of lines) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
            if (currentKey) meta[currentKey] += ' ' + line.trim();
        } else {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                currentKey = line.slice(0, colonIdx).trim();
                meta[currentKey] = line.slice(colonIdx + 1).trim();
            }
        }
    }
    return meta;
}

function stripFrontmatter(raw) {
    return raw.replace(/^---\n[\s\S]*?\n---\n/, '');
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
    await ensureMessagesTable(client);
    console.log('');

    // Dynamically discover all skills in skills/ directory
    const skillsDir = path.join(__dirname, '..', 'skills');
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dir of dirs) {
        const skillFile = path.join(skillsDir, dir, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;

        const raw = fs.readFileSync(skillFile, 'utf-8');
        const meta = parseFrontmatter(raw);
        const content = stripFrontmatter(raw);

        const name = meta.name || dir;
        const version = meta.version || '1.0.0';
        const tags = meta.tags || dir;
        const description = (meta.description || meta.summary || `Skill ${name}`).replace(/\s+/g, ' ').trim();

        if (await skillExists(client, name)) {
            console.log(`⏭️  Skill "${name}" already registered.`);
            continue;
        }

        console.log(`Registering "${name}"...`);
        const result = await client.insert('skills', { name, version, tags, description, content });
        console.log(result.success ? `✅ Registered: ${name}` : `❌ Failed: ${name}`);
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
