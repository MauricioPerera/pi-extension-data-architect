# Security & Authentication Guide

The `pi-extension-data-architect` system implements a multi-layered security model to ensure that data is protected while remaining accessible to authorized agents and users.

## 🔐 The Security Stack

The system uses a combination of API Keys and JSON Web Tokens (JWT) coupled with Role-Based Access Control (RBAC).

### 1. API Key (Administrative/Setup)
The `ADMIN_API_KEY` is a static key used for the initial bootstrapping of the system or emergency access. 
- **Usage**: Passed via `x-api-key` header.
- **Purpose**: Primarily used to create the first administrative user via the `/auth/register` endpoint.

### 2. JWT (Session-Based Access)
For all standard operations, the system uses JWTs.
- **Registration**: A user is created in the `Auth` system of `js-doc-store`.
- **Authentication**: The agent calls `/auth/login` $\rightarrow$ Server validates credentials $\rightarrow$ Server returns a signed JWT.
- **Authorization**: Every subsequent request to `/admin/*` endpoints must include the token in the `Authorization: Bearer <token>` header.

### 3. RBAC (Role-Based Access Control)
Not all authenticated users have the same power. The system assigns roles to identities:

| Role | Permissions | Example Use Case |
|---|---|---|
| `admin` | Full CRUD + Schema changes + User Management | The primary AI orchestrator |
| `editor` | Insert, Update, Query | An agent tasked with data entry |
| `viewer` | Read-only (Public API) | The public web dashboard |

---

## 🛡️ Threat Mitigation

### Prevention of Data Leakage
- **Public vs Admin Separation**: The `/public/` endpoints are strictly read-only and do not require tokens. They only expose the data the admin explicitly allows.
- **Strict Validation**: All `insert` and `update` operations are validated against the table schema.

### Token Lifecycle
- **Expiration**: JWTs have a built-in expiration time. If a token expires, the agent must re-authenticate via `arch_auth_login`.
- **Sovereign Storage**: The tokens are stored in the `pi` settings, not in the project files, preventing accidental leaks via Git.

## 🔑 Key Management
The `JWT_SECRET` is the most critical piece of information. If this secret is leaked, anyone can forge admin tokens. In a production environment, this should be stored in an environment variable (`process.env.JWT_SECRET`) rather than hardcoded in the server file.
