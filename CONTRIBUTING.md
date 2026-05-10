# Contributing to Pi Data Architect

First off, thank you for considering contributing to this project! It's a powerful way to make AI agents more sovereign and capable.

## 🛠️ How to add a new Tool
If you want to add a new data management capability (e.g., a tool for automatic backups):
1. Open `extensions/data-architect.ts`.
2. Use `defineTool` to create the tool.
3. Register it using `pi.registerTool(yourTool)`.
4. Add the tool's description to the `README.md`.

## 🧠 How to add a new Skill
If you want to teach the agent a new way to handle data (e.g., a "Data Auditor" skill):
1. Create a new directory in `skills/`.
2. Add a `SKILL.md` file.
3. Define the a clear **Objective**, **Methodology**, and **Pro-Tips** (follow the `tree-operator` format).

## 🐛 Reporting Bugs
Please open an issue on GitHub describing the unexpected behavior and providing the prompt that caused the issue.

## 📝 Coding Standards
- Use TypeScript for extensions.
- Keep tools atomic (one tool = one clear action).
- Ensure all `arch_*` tools call `db.flush()` to prevent data loss.
