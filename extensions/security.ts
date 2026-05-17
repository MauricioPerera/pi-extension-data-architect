/**
 * Security validation for task-manager inputs.
 * Adapted from pi-scheduler-core/security.ts — same philosophy, different attack surface:
 * task text is natural language passed to an agent, not a direct shell command,
 * so we block embedded shell injection sequences rather than full command patterns.
 */

// ---------------------------------------------------------------------------
// Agent name validation — prevents filesystem path traversal
// ---------------------------------------------------------------------------

export function validateAgentName(name: string): { ok: boolean; reason?: string } {
	if (!name) return { ok: false, reason: "Agent name is required." };
	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		return {
			ok: false,
			reason: `Agent name "${name}" contains forbidden characters. Only letters, digits, hyphens, and underscores are allowed.`,
		};
	}
	if (name.length > 64) {
		return { ok: false, reason: "Agent name too long (max 64 characters)." };
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Task text validation — blocks shell injection embedded in natural language
// ---------------------------------------------------------------------------

const TEXT_BLOCKLIST_SUBSTRINGS = [
	"rm -rf /",
	"rm -rf /*",
	"rm -rf ~",
	"del /f /s /q",
	"rmdir /s /q",
	"format c:",
	"| sh",
	"| bash",
	"| cmd",
	"| powershell",
	"shutdown /s",
	"shutdown -h",
	"reg delete",
	"; rm ",
	"&& rm ",
	"fs.rmsync",
	"fs.rmdirsync",
	"shutil.rmtree",
	"subprocess.call",
	"dd if=/dev/zero",
];

const TEXT_BLOCKLIST_WORDS = [
	"diskpart",
	"mkfs",
];

const MAX_TEXT_LENGTH = 10_000;

export function validateTaskText(text: string, fieldName: string): { ok: boolean; reason?: string } {
	if (!text) return { ok: true };
	if (text.length > MAX_TEXT_LENGTH) {
		return { ok: false, reason: `${fieldName} exceeds maximum length (${MAX_TEXT_LENGTH} characters).` };
	}
	const lower = text.toLowerCase().replace(/\s+/g, " ");
	for (const pattern of TEXT_BLOCKLIST_SUBSTRINGS) {
		if (lower.includes(pattern)) {
			return { ok: false, reason: `${fieldName} blocked by security policy: dangerous pattern detected.` };
		}
	}
	for (const word of TEXT_BLOCKLIST_WORDS) {
		const re = new RegExp("\\b" + word + "\\b", "i");
		if (re.test(lower)) {
			return { ok: false, reason: `${fieldName} blocked by security policy: forbidden word "${word}".` };
		}
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Composite task validation — runs all checks, returns first failure
// ---------------------------------------------------------------------------

export interface TaskSecurityFields {
	title?: string;
	description?: string;
	input?: string;
	agent?: string;
}

export function validateTaskFields(fields: TaskSecurityFields): { ok: boolean; reason?: string } {
	if (fields.agent !== undefined) {
		const r = validateAgentName(fields.agent);
		if (!r.ok) return r;
	}
	for (const [field, value] of [
		["title", fields.title],
		["description", fields.description],
		["input", fields.input],
	] as [string, string | undefined][]) {
		if (value !== undefined) {
			const r = validateTaskText(value, field);
			if (!r.ok) return r;
		}
	}
	return { ok: true };
}
