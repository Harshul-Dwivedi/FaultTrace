import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["src/index.js"],
});
const client = new Client({ name: "stdio-smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log(`stdio server OK: ${tools.tools.length} tools`);

const result = await client.callTool({
  name: "get_dtcs",
  arguments: { vin: "1HGCM82633A004352" },
});
console.log("get_dtcs over stdio:", result.content[0].text.slice(0, 80), "...");

await client.close();
process.exit(0);
