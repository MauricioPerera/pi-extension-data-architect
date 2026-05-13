---
name: flow-engine
version: 1.0.0
tags: flow,workflow,automation,orchestration,pi-extension
description: Pi extension for workflow automation enabling resilient server startup procedures and agent-based workflow orchestration.
author: Pi Agent
---

# Flow Engine Extension

This extension provides a robust workflow automation system for Pi that enables:
- Resilient server startup procedures accessible even when the server is down
- Agent-based workflow orchestration using Pi's existing capabilities
- Persistent storage of workflow definitions and executions via js-doc-store-server
- Visual tracking of workflow execution status in the Pi TUI

## Problem Statement

Pi agents often need to orchestrate complex workflows involving multiple steps:
- Starting dependent services (like js-doc-store-server)
- Executing sequences of agent, skill, and tool operations
- Handling failures and retries gracefully
- Tracking execution status and results
- Ensuring critical bootstrap procedures run even when the server is offline

Prior to this extension, users had to manually manage these workflows using custom scripts or complex prompt engineering.

## Solution Overview

The flow-engine extension introduces:
1. **Workflow Definitions**: JSON-based definitions of workflows consisting of nodes (agent, skill, tool)
2. **Execution Engine**: Reliable execution of workflows with dependency resolution
3. **Persistence Layer**: Storage of workflow definitions, runs, and task instances in js-doc-store-server
4. **Monitoring Tools**: Commands to check workflow status and list available workflows
5. **Bootstrap Automation**: Automatic setup of essential database tables
6. **TUI Integration**: Widget displaying flow engine readiness status

## Key Features

### Workflow Node Types
- **agent**: Execute Pi subagents with input/output mapping
- **skill**: Load and invoke Pi skills from the skill registry
- **tool**: Execute Pi built-in or custom tools (read, write, bash, etc.)

### Dependency Resolution
- Automatic topological sort of workflow nodes based on `dependsOn` relationships
- Prevents circular dependency detection and provides clear error messages

### Input/Output Mapping
- Use `${variable}` syntax to map outputs from previous nodes as inputs to subsequent nodes
- Support for literal values and complex object mapping
- Flexible output storage (raw output under node ID or mapped to context variables)

### Error Handling & Retries
- Configurable maximum retry attempts per node
- Automatic retry with exponential backoff (leveraging Pi's retry system)
- Detailed error logging and tracking via Pi's message system

### Persistence
- All workflow definitions stored in `flows` table
- All workflow executions stored in `flow_runs` table
- Individual task executions stored in `task_instances` table
- Automatic table creation via `run_bootstrap` tool

### TUI Integration
- Session startup widget showing "🟢 Flow Engine Ready" when operational
- Extensible for future enhancement with detailed workflow visualization

## Installation

The extension is installed as a standard Pi extension:

```bash
# From anywhere, install the extension
pi install git:https://github.com/MauricioPerera/pi-extension-data-architect

# Or install locally if you have the repo cloned
pi install -l /path/to/pi-extension-data-architect
```

## Usage

Once installed, the extension provides several custom tools:

### flow_create
Store a new workflow definition.

**Parameters:**
- `name` (string, required): Unique name for the workflow
- `definition` (string, required): JSON string representing the workflow definition
- `description` (string, optional): Human-readable description
- `tags` (string, optional): Comma-separated tags for categorization
- `version` (string, optional): Semantic version (default: "1.0.0")

**Example:**
```bash
/tool:flow_create
{
  "name": "server_startup_check",
  "definition": "{\"nodes\":[{\"id\":\"check_server\",\"type\":\"tool\",\"tool\":\"bash\",\"inputMapping\":{\"command\":\"curl -s http://localhost:3000/public/tables || echo 'SERVER_DOWN'\"}},{\"id\":\"start_if_needed\",\"type\":\"agent\",\"agent\":\"server-watchdog\",\"inputMapping\":{\"command\":\"start\"},\"dependsOn\":[\"check_server\"]}]}",
  "description": "Check js-doc-store-server status and start if needed",
  "tags": "server,startup,automation",
  "version": "1.0.0"
}
```

### flow_list
List all stored workflow definitions.

**Parameters:**
- `tags` (string, optional): Comma-separated tags to filter by

**Example:**
```bash
/tool:flow_list
# Lists all workflows

/tool:flow_list
{
  "tags": "server,startup"
}
# Lists only workflows with server and startup tags
```

### flow_run
Execute a workflow by name.

**Parameters:**
- `flowName` (string, required): Name of the workflow to execute
- `variables` (string, optional): JSON string of variables to pass to the workflow

**Example:**
```bash
/tool:flow_run
{
  "flowName": "server_startup_check"
}
```

### flow_status
Check the status of a workflow run.

**Parameters:**
- `runId` (string, required): ID of the workflow run to check

**Example:**
```bash
/tool:flow_status
{
  "runId": "abc123def456"
}
```

### run_bootstrap
Ensure essential tables exist for the flow engine to operate.

**Parameters:** None

**Example:**
```bash
/tool:run_bootstrap
# Creates tables: flows, flow_runs, task_instances, skills, messages if they don't exist
```

## Workflow Definition Format

A workflow definition is a JSON object with the following structure:

```json
{
  "nodes": [
    {
      "id": "unique_node_id",
      "type": "agent|skill|tool",
      "agent": "agent_name", // Required for agent type
      "skill": "skill_name", // Required for skill type
      "tool": "tool_name",   // Required for tool type
      "dependsOn": ["node_id1", "node_id2"], // Optional: array of node IDs this node depends on
      "inputMapping": {      // Optional: mapping of inputs for this node
        "param1": "${previous_node.output}",
        "param2": "literal_value",
        "param3": "${context.variable}"
      },
      "outputMapping": {     // Optional: mapping of outputs to context
        "context_key": "${node.output}",
        "another_key": "literal_value"
      },
      "maxRetries": 3       // Optional: maximum retry attempts (default: 0)
    }
  ]
}
```

### Node Types Details

#### Agent Nodes
Execute Pi subagents:
```json
{
  "id": "process_data",
  "type": "agent",
  "agent": "data-processor",
  "inputMapping": {
    "inputData": "${fetch_data.output}"
  },
  "dependsOn": ["fetch_data"]
}
```

#### Skill Nodes
Load and invoke Pi skills:
```json
{
  "id": "validate_input",
  "type": "skill",
  "skill": "input-validator",
  "inputMapping": {
    "dataToValidate": "${user_input}",
    "rules": "${validation_rules}"
  }
}
```

#### Tool Nodes
Execute Pi tools:
```json
{
  "id": "save_results",
  "type": "tool",
  "tool": "write",
  "inputMapping": {
    "path": "./results/${workflow_id}.json",
    "content": "${process_data.output}"
  },
  "dependsOn": ["process_data"]
}
```

## Resilient Server Startup Integration

This extension works seamlessly with the embedded server startup procedure in the skill-registry skill (version 2.2.0):

1. When the js-doc-store-server is down, the skill-registry skill provides the `server-startup` procedure
2. The flow engine can execute this procedure as a skill node in workflows
3. Example workflow for ensuring server availability:

```json
{
  "nodes": [
    {
      "id": "check_server",
      "type": "tool",
      "tool": "bash",
      "inputMapping": {
        "command": "curl -s http://localhost:3000/public/tables || echo 'DOWN'"
      }
    },
    {
      "id": "start_server_if_needed",
      "type": "skill",
      "skill": "server-startup",
      "dependsOn": ["check_server"]
    },
    {
      "id": "verify_server_started",
      "type": "tool",
      "tool": "bash",
      "inputMapping": {
        "command": "curl -s http://localhost:3000/public/tables"
      },
      "dependsOn": ["start_server_if_needed"]
    }
  ]
}
```

## Bootstrap Process

On f
