// Real end-to-end test against TMS API.
//
//   node --env-file=.env --experimental-strip-types scripts/e2e.mjs

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.ts";

const KEY = process.env.TMS_API_KEY;
if (!KEY) {
  console.error("ERROR: TMS_API_KEY not set");
  process.exit(1);
}

const server = buildServer(KEY);
const [clientT, serverT] = InMemoryTransport.createLinkedPair();
await server.connect(serverT);

const client = new Client({ name: "e2e", version: "0.0.0" }, { capabilities: {} });
await client.connect(clientT);

async function run(label, name, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "(no text)";
  const isError = res.isError || (res.structuredContent && "error" in res.structuredContent);
  console.log(isError ? "❌ ERROR" : "✅ OK");
  console.log(text.slice(0, 600));
  return res;
}

const projects = await run("list_projects", "list_projects", { page_size: 5 });
const grow = projects.structuredContent.projects?.find((p) => p.human_id_prefix === "GR");
if (!grow) {
  console.error("GROW project not found, aborting");
  process.exit(1);
}
console.log(`\nGROW project: ${grow.id}`);

await run("get_project", "get_project", { project_id: grow.id });
await run("list_folders", "list_folders", { project_id: grow.id, page_size: 3 });

const tcs = await run("list_test_cases", "list_test_cases", { project_id: grow.id, page_size: 3 });
const firstTc = tcs.structuredContent.test_cases?.[0];
if (firstTc) {
  await run("get_test_case", "get_test_case", { project_id: grow.id, test_case_id: firstTc.id });
}

await run("list_test_plans", "list_test_plans", { project_id: grow.id, page_size: 3 });

const runs = await run("list_test_runs", "list_test_runs", { project_id: grow.id, page_size: 3 });
const firstRun = runs.structuredContent.test_runs?.[0];
if (firstRun) {
  await run("get_test_run", "get_test_run", { project_id: grow.id, test_run_id: firstRun.id });
}

await run("list_label_options", "list_label_options", {});
await run("list_label_options (filtered)", "list_label_options", {
  kinds: ["test_case_statuses", "test_run_statuses"],
});

console.log("\n=== E2E complete ===");
await client.close();
await server.close();
