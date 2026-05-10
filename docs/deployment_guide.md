# Deployment Guide

This guide provides step-by-step instructions for deploying the complete Data Architect ecosystem, from the core server to the agent extensions.

## 🏗️ Phase 1: The Data Server (Backend)

The server is the single source of truth and must be running for the a Remote/Multi-Agent setup.

1. **Clone and Setup**:
   ```bash
   git clone https://github.com/MauricioPerera/pi-extension-data-architect-server # Use the server repo
   cd js-doc-store-server
   npm install
   ```

2. **Configuration**:
   Edit `server.js` or set environment variables for:
   - `PORT`: The port the server will run on (default: 3000).
   - `DATA_DIR`: The path where JSON files will be stored.
   - `JWT_SECRET`: A strong random string for signing tokens.

3. **Start the Server**:
   ```bash
   npm start
   ```
   The server is now live at `http://localhost:3000`.

---

## 🤖 Phase 2: The Agent Extension (Client)

1. **Installation**:
   Install the extension via the `pi` CLI:
   ```bash
   pi install git:https://github.com/MauricioPerera/pi-extension-data-architect
   ```

2. **Activation**:
   Configure the agent to use Remote Mode in `settings.json` or via `/settings`:
   - `dataArchitectMode`: `"remote"`
   - `dataArchitectServerUrl`: `"http://localhost:3000"`

3. **Initial Authentication**:
   The agent must first create an identity and log in:
   - Use `arch_auth_register` (Email, Password, Name).
   - Use `arch_auth_login` to retrieve the JWT token.
   - The agent will now automatically include this token in all requests.

---

## 🌐 Phase 3: The Public Dashboard (Frontend)

The dashboard is a static HTML page that can be served directly by the `js-doc-store-server`.

1. **Place the file**: Ensure `index.html` is located in the `public/` folder of the server.
2. **Access**: Open your browser and navigate to `http://localhost:3000`.
3. **Functionality**: You can now select any table created by the agent and view the data in real-time without needing any authentication (Read-Only).

## 🚀 Summary Checklist

- [ ] Server is running and `public` folder is mapped.
- [ ] Extension is installed in `pi`.
- [ la l ] `dataArchitectMode` is set to `remote`.
- [ ] Agent has successfully performed `arch_auth_login`.
- [ ] Dashboard is accessible via browser.
