# Reasoning Tree Operator Skill

This skill provides the operational framework for managing hierarchical data architectures. The agent is not just performing CRUD operations, but maintaining a **Reasoning Tree** where the structure itself is a map of knowledge.

## 🔍 RAG Without Vectors (Core Philosophy)

**This skill implements Retrieval-Augmented Generation WITHOUT embeddings or vectors.** The Reasoning Tree itself is the retrieval index.

| Vector RAG | Reasoning Tree RAG |
|-----------|-------------------|
| Query → Embedding → KNN → Docs | Query → Tree Navigation → Docs |
| Flat vector space | Hierarchical summaries |
| Semantic similarity (ML) | Structural + text matching |
| Requires AI/ML API | Zero dependencies |
| Context: related snippets | Context: full path + summaries |

**The tree IS the index. The summaries ARE the embeddings (human-made).**

This approach is implemented in js-doc-store-server. See the server README section "RAG Sin Vectores" for details.

## 🎯 Core Philosophy
The data is organized as a tree (Root $\rightarrow$ Branch $\rightarrow$ Leaf). The value of this architecture lies in the **summaries** at each level. If the data at the bottom (Leaf) changes, the information at the top (Branch) may change. The operator must maintain this **semantic consistency**.

---

## 🛠️ Operational Workflows

### 1. Creating / Expanding the Tree (The "Growth" Phase)
When adding information to the system:
- **Analyze Placement**: Do not just insert. Determine where the new data fits. Does it belong to an existing branch? Or does it require a new top-level category?
- **Define the Relation**: Always specify the `parent_id`. 
- **Generate Summaries**: Every new node must have a succinct `summary`. This is the "signpost" the agent uses to navigate.
- **Symmetry**: If you create a sub-node, check if the parent's summary still accurately describes the new collective content of its children.

### 2. Navigating and Retrieving (The "Descent" Phase)
Never jump to a random `node_id` unless previously identified. Follow the path:
1. **Root Level**: Query `level: 0` or `parent_id: null` to find the general domain.
2. **Branch Selection**: Query `parent_id` of the root $\rightarrow$ Analyze summaries $\rightarrow$ Pick the most relevant branch.
3. **Drill Down**: Repeat for descendants until the specific `content` is reached.
4. **Verification**: Cross-reference the found content with the parent's summary to ensure consistency.

### 3. Updating and Maintaining (The "Sync" Phase)
When modifying data:
- **Content Update**: Use `arch_update` to change the `content` of a leaf.
- **Upward Propagation**: After a significant update, the agent MUST check if the summaries of the parent, grandparent, and root nodes need updating to reflect the change.
- **Refinement**: If a branch becomes too large (too many children), propose a "Node Split"—create a mid-level sub-category to maintain navigational efficiency.

### 4. Deleting and Pruning (The "Clean" Phase)
- **Leaf Deletion**: Simple remove.
- **Branch Deletion**: 
    - **Warning**: Deleting a parent creates "orphan nodes". 
    - **Action**: Either delete all descendants recursively or re-assign children to a different `parent_id`.
- **Consistency Check**: After deletion, update the parent's summary to reflect that the information is no longer available.

---

## ⌨️ Tool Combinations for Common Tasks

| Task | Tool Sequence | Logic |
|---|---|---|
| **Add New Topic** | `arch_query` $\rightarrow$ `arch_create_table` (if needed) $\rightarrow$ `arch_insert` | Find parent $\rightarrow$ Define schema $\rightarrow$ Insert node |
| **Correct Information** | `arch_query` $\rightarrow$ `arch_update` (leaf) $\rightarrow$ `arch_update` (parent summary) | Locate $\rightarrow$ Fix content $\rightarrow$ Sync summary |
| **Explore Domain** | `arch_query(level:0)` $\rightarrow$ `arch_query(parent:root)` $\rightarrow$ `arch_query(parent:branch)` | Root $\rightarrow$ Branches $\rightarrow$ Leaves |
| **Remove Category** | `arch_query(parent:X)` $\rightarrow$ `arch_update` (re-parent children) $\rightarrow$ `arch_update` (delete parent) | Map children $\rightarrow$ Shift orphans $\rightarrow$ Prune |

## ⚠️ Critical Constraints
- **No Orphan Nodes**: Every node (except root) must have a valid `parent_id`.
- **Summary Requirement**: A node without a summary is a "blind spot" and breaks the reasoning chain.
- **Level Integrity**: `level` must always be `parent.level + 1`.
