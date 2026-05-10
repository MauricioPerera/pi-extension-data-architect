# System Architecture: Pi Data Architect

This document describes the technical architecture of the Data Architect ecosystem, designed for autonomous data management by AI agents without reliance on external cloud services.

## 🗺️ High-Level Overview

The system is designed as a hybrid architecture that can operate in two distinct modes: **Standalone (Local)** and **Collaborative (Remote)**.

### 1. Standalone Mode (Local)
In this mode, the `pi` agent owns the database entirely.
- **Flow**: `AI Agent` $\rightarrow$ `Extension` $\rightarrow$ `Local File System (JSON)`.
- **Pros**: Zero latency, maximum privacy, no network dependencies.
- **Cons**: Data is locked to a single agent/session; no concurrent access.

### 2. Collaborative Mode (Remote)
The system transitions to a Client-Server architecture to enable multi-agent collaboration and web integration.
- **Flow**: `AI Agent` $\rightarrow$ `Extension (HTTP Client)` $\rightarrow$ `DocStore Server (API)` $\rightarrow$ `Shared File System`.
- **Pros**: Multi-agent access, real-time synchronization, public data exposure via API.
- **Cons**: Requires a running Node.js server.

---

## 🏗️ Component Breakdown

### The Core: `js-doc-store`
The foundation is a vanilla JS document database. It uses an **Adapter Pattern** to decouple the database logic from the physical storage. 
- **Storage**: Data is stored in a set of JSON files (`.docs.json` for data, `.meta.json` for schema/indexes).
- **Indexing**: Supports Hash and Sorted indexes for $O(1)$ and $O(\log n)$ lookups.

### The Server: `js-doc-store-server`
A Node.js/Express wrapper that transforms the local DB into a professional API.
- **State Management**: Maintains a `tableCache` to ensure high performance across multiple agent requests.
- **Persistence**: Handles `db.flush()` calls to ensure data is atomically written to disk.
- **CORS**: Enabled to allow the frontend dashboard to consume data from different origins.

### The Interface: `pi-extension`
The TypeScript extension acting as the agent's "hands".
- **Mode Switching**: Dynamically changes its behavior based on `pi.settings.get('dataArchitectMode')`.
- **Auth Handling**: Manages the lifecycle of JWT tokens, storing them securely in the agent's settings.

---

## 🔄 Data Flow Diagram

**Request Cycle (Remote Mode):**
`User Query` $\rightarrow$ `AI Agent` $\rightarrow$ `Extension (adds JWT Token)` $\rightarrow$ `HTTP POST /admin/query` $\rightarrow$ `Server (Validates JWT & Role)` $\rightarrow$ `js-doc-store` $\rightarrow$ `JSON Files` $\rightarrow$ `Response back to Agent`.
