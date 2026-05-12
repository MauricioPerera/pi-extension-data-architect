const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3000';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtcDMxZXI1Zy05aDNlYjUtMSIsImVtYWlsIjoiYWRtaW5AdGVzdC5jb20iLCJyb2xlcyI6WyJ1c2VyIiwiYWRtaW4iXSwiaWF0IjoxNzc4NjIwMDU0LCJleHAiOjE3Nzg3MDY0NTR9.yyPsvTbyNsn4p3ySUVI4dgGvhsHLlAtNS5BH4_Jc8Hw';

const skillsDir = process.argv[2] || './skills';

async function insertSkill(name, version, tags, description, content) {
    const res = await fetch(`${SERVER_URL}/admin/insert`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            tableName: 'skills',
            data: { name, version, tags, description, content }
        })
    });
    if (!res.ok) {
        console.error(`Failed to insert ${name}: ${res.status}`);
        return false;
    }
    console.log(`Inserted: ${name}`);
    return true;
}

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;
    const fm = {};
    match[1].split('\n').forEach(line => {
        const [key, ...val] = line.split(':');
        if (key && val.length > 0) fm[key.trim()] = val.join(':').trim();
    });
    return { frontmattter: fm, body: match[2] };
}

async function main() {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    for (const dir of dirs) {
        const filePath = path.join(skillsDir, dir, 'SKILL.md');
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontmatter(content);
        if (!parsed) {
            console.error(`No frontmatter in ${dir}`);
            continue;
        }

        const { name, version, tags, description } = parsed.frontmattter;
        if (!name) {
            console.error(`No name in ${dir}`);
            continue;
        }

        const ok = await insertSkill(
            name,
            version || '1.0.0',
            tags || dir,
            description || `${name} skill`,
            content
        );
        if (!ok) process.exitCode = 1;
    }
}

main().catch(e => { console.error(e); process.exit(1); });
