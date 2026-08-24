#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { fileURLToPath } from "url";
import { ScenarioStore } from "./scenarioStore.js";

const store = new ScenarioStore(fileURLToPath(new URL("../scenarios", import.meta.url)));

const server = new McpServer({
  name: "FaultTrace-vehicle-service",
  version: "0.1.0",
});

registerTools(server, store);

const transport = new StdioServerTransport();
await server.connect(transport);
