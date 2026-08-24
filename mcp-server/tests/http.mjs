import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(`http://localhost:${process.env.MCP_HTTP_PORT || 9090}/mcp`);
const client = new Client({ name: "http-smoke", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(url));

const tools = await client.listTools();
console.log(`http server OK: ${tools.tools.length} tools`);

const result = await client.callTool({
  name: "get_freeze_frame",
  arguments: { vin: "1HGCM82633A004352", code: "P0171" },
});
const frame = JSON.parse(result.content[0].text);
console.log(`freeze frame via HTTP: load=${frame.engine_load}%, ltft=${frame.long_fuel_trim}%`);

if (frame.engine_load <= 50) throw new Error("unexpected freeze-frame values");
process.exit(0);
