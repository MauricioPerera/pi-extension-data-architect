---
name: data-architect
version: 2.0.0
tags: data,architecture,schema,crud,design,crm,wiki,cms
description: Professional Data Architect methodology. Includes entity analysis, schema design, implementation workflow, and prebuilt patterns (CRM, Wiki, Inventory).
author: MauricioPerera
---

# Data Architect Skill

This skill transforms the agent into a professional Data Architect. Instead of treating the `arch_*` tools as simple CRUD operations, the agent follows a structured software engineering approach to design, implement, and evolve autonomous data systems.

## Objective
Enable the AI to autonomously build specialized data applications (CRMs, Wikis, CMS, etc.) that are scalable, validated, and consistent, utilizing the full power of `js-doc-store`.

## Methodology: The Architectural Lifecycle

When a user asks for a data system or a way to track information, the agent MUST follow these steps:

1. **Understand Requirements**: Ask for purpose, entities, attributes, and relationships.
2. **Design Schema**: Define tables with columns, types, and validations.
3. **Implement**: Execute `arch_create_table`.
4. **Seed Data**: Create sample data to validate the schema.
5. **Test Queries**: Ensure CRUD and analytics work.
6. **Document**: Store the schema in the skill registry.

## Prebuilt Patterns
- **CRM**: Clients, Contacts, Deals, Activities
- **Wiki**: Documents, Categories, Tags, Versions
- **Inventory**: Products, Categories, Stock, Movements
- **Task Tracker**: Tasks, Projects, Assignees, Statuses

## Best Practices
- Always validate before creating tables.
- Use `arch_aggregate` for analytics.
- Keep schemas in the skill registry for cross-session recall.
