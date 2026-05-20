// Local smoke test: instantiate the MCP server, call tools/list via the
// in-memory transport. No HTTP, no real TMS API call. Verifies wiring.
//
// Usage:  node scripts/smoke.mjs

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.ts";

const server = buildServer("smoke-test-fake-key");
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

await server.connect(serverTransport);

const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(clientTransport);

const tools = await client.listTools();
console.log("Registered tools:");
for (const t of tools.tools) {
  console.log(`  - ${t.name}: ${t.description?.slice(0, 80)}...`);
}

await client.close();
await server.close();
