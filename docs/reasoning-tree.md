# The Reasoning Tree Philosophy

This document explains the theoretical foundation of the `pi-extension-data-architect` and why it adopts a "Reasoning Tree" approach instead of traditional Vector-based RAG.

## ❌ The Problem with Vector RAG (Similarity $\neq$ Relevance)

Traditional RAG systems use vector embeddings to find "similar" chunks of text. However:
1. **Lack of Context**: A chunk might be semantically similar to a query but lack the necessary context from the surrounding pages.
2. **"Vibe" Retrieval**: Vector search often returns results that "feel" right but are factually unrelated to the specific section of a document.
3. **Scaling Issues**: As the document size increases, the noise in vector similarity increases, leading to lower precision.

## ✅ The Solution: Hierarchical Reasoning Trees

Instead of flat fragments, this extension implements a **Hierarchical Tree Index**. This simulates how a human expert navigates a professional document: they don't scan random pages; they use the Table of Contents $\rightarrow$ Sections $\rightarrow$ Sub-sections $\rightarrow$ Specific Paragraphs.

### How the Tree Works

1. **Semantic Summarization**: Every node in the tree (from Root to Leaf) contains a summary.
2. **Intent-Based Navigation**: The agent doesn't search for keywords; it reasons about the summaries.
   - *Query*: "How do I activate MFA?"
   - *LLM Step 1*: "I see 'Security' and 'HR' branches. I'll go to 'Security'."
   - *LLM Step 2*: "Inside 'Security', I see 'Physical' and 'Digital'. I'll go to 'Digital'."
   - *LLM Step 3*: "Inside 'Digital', I find 'VPN & MFA'. I've arrived."
3. **Precision**: By the time the agent reaches the "Leaf" node, it has a perfect chain of context, ensuring the answer is relevant and traceable.

## 🏗️ Comparison at a Glance

| Feature | Vector-based RAG | Reasoning Tree (This Extension) |
|---|---|---|
| **Mechanism** | Mathematical Similarity ($\cos \theta$) | Semantic Reasoning over Summaries |
| **Structure** | Flat Chunks | Hierarchical Tree |
| **Traceability** | Approximate / Opaque | Exact path (Root $\rightarrow$ Branch $\rightarrow$ Leaf) |
| **Context** | Window-based (often truncated) | Full Contextual Chain |
| **Complexity** | High (Requires Embedding Model + Vector DB) | Low (JS-Doc-Store / JSON) |

## 🛠️ Implementation in `pi`

This extension leverages the `js-doc-store` library to persist these trees. The `Tree Operator` skill ensures that the agent maintains the integrity of these summaries, updating parents when children change, and navigating efficiently from the top down.
