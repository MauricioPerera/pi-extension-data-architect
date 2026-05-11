/**
 * Skill Registry Migration Script
 * 
 * Migrates all SKILL.md files from a directory into js-doc-store-server's
 * 'skills' table, enabling dynamic skill discovery.
 * 
 * Usage:
 *   node migrate-skills.js http://localhost:3000 YOUR_JWT_TOKEN ~/.agents/skills
 */

const fs = require('fs');
const path = require('path');

async function migrateSkills(apiUrl, token, skillsDir) {
    const entries = fs.readdirSync(skillsDir);
    const migrated = [];

    for (const entry of entries) {
        const fullPath = path.join(skillsDir, entry);
        if (!fs.statSync(fullPath).isDirectory()) continue;

        const skillFile = path.join(fullPath, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;

        const content = fs.readFileSync(skillFile, 'utf-8');
        const titleMatch = content.match(/^# (.+)$/m);
        const description = titleMatch ? titleMatch[1] : entry;

        const res = await fetch(`${apiUrl}/admin/insert`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tableName: 'skills',
                data: {
                    name: entry,
                    version: '1.0.0',
                    tags: entry,
                    description,
                    content
                }
            })
        });

        const result = await res.json();
        migrated.push({ name: entry, id: result.id || result._id, success: result.success !== false });
        console.log(`Migrated: ${entry} → ${result.success !== false ? 'OK' : 'FAIL'}`);
    }

    return migrated;
}

async function main() {
    const [apiUrl, token, skillsDir] = process.argv.slice(2);

    if (!apiUrl || !token || !skillsDir) {
        console.error('Usage: node migrate-skills.js <API_URL> <JWT_TOKEN> <SKILLS_DIR>');
        console.error('Example: node migrate-skills.js http://localhost:3000 abc123 ~/.agents/skills');
        process.exit(1);
    }

    console.log(`Migrating skills from: ${skillsDir}`);
    console.log(`To: ${apiUrl}/admin/insert`);
    console.log('');

    const results = await migrateSkills(apiUrl, token, skillsDir);
    const successCount = results.filter(r => r.success).length;

    console.log(`\nDone. ${successCount}/${results.length} skills migrated.`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
