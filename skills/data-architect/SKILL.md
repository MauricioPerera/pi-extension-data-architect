# Data Architect Skill

This skill transforms the agent into a professional Data Architect. Instead of treating the `arch_*` tools as simple CRUD operations, the agent follows a structured software engineering approach to design, implement, and evolve autonomous data systems.

## 🎯 Objective
Enable the AI to autonomously build specialized data applications (CRMs, Wikis, CMS, etc.) that are scalable, validated, and consistent, utilizing the full power of `js-doc-store`.

## 🛠️ Methodology: The Architectural Lifecycle

When a user asks for a data system or a way to track information, the agent MUST follow these steps:

### 1. Analysis & Design (The "Blueprint" Phase)
**Do not call tools yet.** First, respond to the user with a proposed design:
- **Entity Identification**: Define what the main tables are (e.g., `users`, `projects`, `tasks`).
- **Schema Definition**: For each table, propose the columns, their types (text, number, relation, etc.), and constraints (`required`, `unique`).
- **Relationship Mapping**: Identify how tables link together using `relation` types.
- **Query Patterns**: Identify the main questions the user wants to answer to determine if specific indices or views are needed.

### 2. Implementation (The "Build" Phase)
Once the design is agreed upon:
1. Use `arch_create_table` to implement the structures.
2. If the system is complex, create the tables in order of dependency (parent tables first, then relation tables).
3. Verify the implementation using `arch_get_schema`.

### 3. Data Populating (The "Seed" Phase)
1. Use `arch_insert` to add initial or provided data.
2. Ensure all `required` fields are present to avoid validation errors.
3. Use `arch_query` to verify the data was inserted correctly.

### 4. Analysis & Evolution (The "Insight" Phase)
- **Reporting**: Use `arch_aggregate` for any request involving sums, averages, or grouping. Never pull all data to the prompt to calculate totals; let the DB do it.
- **Optimization**: If a table grows, propose adding indices or refining the schema.
- **Maintenance**: Use `arch_list_tables` at the start of a session to rediscover existing architectures.

---

## 📚 Architectural Patterns for the Agent

The agent should use these templates as a starting point for common requests:

### 🏢 CRM (Customer Relationship Management)
- `clients`: { Name: text, Email: email(unique), Company: text, Status: select(['Lead', 'Active', 'Churned']) }
- `interactions`: { ClientId: relation(clients), Date: date, Notes: text, Type: select(['Call', 'Email', 'Meeting']) }
- `deals`: { ClientId: relation(clients), Value: number, CloseDate: date, Stage: select(['Prospecting', 'Negotiation', 'Closed']) }

### 📖 Knowledge Wiki / Zettelkasten
- `pages`: { Title: text, Content: text, Tags: multiselect, CreatedAt: date }
- `links`: { SourceId: relation(pages), TargetId: relation(pages), Type: text }
- `meta`: { Key: text(unique), Value: text }

### 📦 Inventory / Catalog
- `products`: { SKU: text(unique), Name: text, Category: select, Price: number, Stock: number }
- `suppliers`: { Name: text, Contact: email, LeadTime: number }
- `stock_movements`: { ProductId: relation(products), Change: number, Reason: text }

---

## ⚠️ Pro-Tips & Constraints

- **Relation Integrity**: When inserting a `relation` field, always ensure the target `_id` actually exists in the referenced table.
- **Aggregation over Iteration**: Always prefer `arch_aggregate` for data analysis over `arch_query` + manual loop in the prompt.
- **Schema First**: Never insert data into a collection that hasn't been formally defined via `arch_create_table` if you want validation.
- **Case Sensitivity**: Remember that `js-doc-store` queries are precise. Use `$regex` for case-insensitive searches.

## 🚀 Quick-Start Command for the Agent
When the user says *"I need a [System Name]"*, internalize this:
`[Analyze Entities] -> [Propose Schema] -> [Create Tables] -> [Populate Data] -> [Query/Aggregate]`
