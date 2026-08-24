import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fileURLToPath } from "url";
import { registerTools } from "./tools.js";
import { ScenarioStore } from "./scenarioStore.js";

const DEFAULT_PORT = 9090;
const port = Number(process.env.MCP_HTTP_PORT) || DEFAULT_PORT;

const store = new ScenarioStore(fileURLToPath(new URL("../scenarios", import.meta.url)));

function createServer() {
  const server = new McpServer({
    name: "faulttrace-vehicle-service",
    version: "0.1.0",
  });
  registerTools(server, store);
  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close();
  });
  const server = createServer();
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String(error) }, id: null });
    }
  }
});

app.get("/mcp", async (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "GET not supported (stateless mode)" }, id: null });
});

app.delete("/mcp", async (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "DELETE not supported (stateless mode)" }, id: null });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", vins: store.listVins() });
});

app.listen(port, () => {
  console.log(`faulttrace-vehicle-service MCP listening on http://localhost:${port}/mcp`);
});
