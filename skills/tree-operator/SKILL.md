---
name: tree-operator
version: 2.0.0
tags: rag,tree,reasoning,knowledge,hierarchy,navigation,semantic
description: RAG without embeddings using hierarchical Reasoning Trees. Navigate Root→Branch→Leaf, maintain summaries, and retrieve via structure rather than vectors.
author: MauricioPerera
---

# Tree Operator Skill

RAG without embeddings using hierarchical Reasoning Trees.

## Philosophy
Instead of relying on expensive vector similarity, organize knowledge into a tree where each node contains a summary. Retrieval becomes tree navigation, not vector math.

## Workflow
1. **Create Root**: High-level topic.
2. **Add Branches**: Sub-topics with summaries.
3. **Add Leaves**: Detailed content.
4. **Navigate**: Query summaries to find relevant branches.

## Advantages
- Zero embedding cost.
- Deterministic retrieval.
- Human-understandable structure.

## Tools
- `arch_tree_navigate`: Search by keyword and descend from root to leaf.
- `arch_tree_create`: Build reasoning trees with summaries.
