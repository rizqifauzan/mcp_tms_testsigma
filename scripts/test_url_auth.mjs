// HTTP-layer test for URL-path + header-based API key auth.
// Spins up the actual server.ts handler and hits it with real HTTP requests.
//
//   npm run test:url-auth

import server from "../server.js";

const KEY = process.env.TMS_API_KEY;
if (!KEY) {
  console.error("ERROR: TMS_API_KEY not set");
  process.exit(1);
}

const port = 0;
await new Promise((r) => server.listen(port, r));
const addr = server.address();
const base = `http://127.0.0.1:${addr.port}`;
console.log(`Server up at ${base}\n`);

let pass = 0;
let fail = 0;

async function expect(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "✅" : "❌"} ${label}: got ${actual}, want ${expected}`);
  ok ? pass++ : fail++;
}

const toolsListBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
});

// 1. POST /mcp with X-Testsigma-Key header (Claude Code path)
{
  const r = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Testsigma-Key": KEY,
    },
    body: toolsListBody,
  });
  await expect("POST /mcp + header → 200", r.status, 200);
  const text = await r.text();
  const hasTools = text.includes('"name":"list_projects"');
  await expect("  response contains tools/list result", hasTools, true);
}

// 2. POST /mcp/<key> with no header (Claude Web path)
{
  const r = await fetch(`${base}/mcp/${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: toolsListBody,
  });
  await expect("POST /mcp/<key> path → 200", r.status, 200);
  const text = await r.text();
  const hasTools = text.includes('"name":"list_projects"');
  await expect("  response contains tools/list result", hasTools, true);
}

// 3. POST /mcp with no auth at all
{
  const r = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: toolsListBody,
  });
  await expect("POST /mcp (no auth) → 401", r.status, 401);
}

// 4. POST /random → 404
{
  const r = await fetch(`${base}/random`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await expect("POST /random → 404", r.status, 404);
}

// 5. POST /mcp/<bad_key> → reaches TMS, gets 401 from TMS via 401-passthrough
{
  const r = await fetch(`${base}/mcp/not-a-real-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: toolsListBody,
  });
  // tools/list itself doesn't call TMS, only tools/call does.
  // So a bad key still returns 200 here — the failure happens on first TMS hit.
  await expect("POST /mcp/<bad_key> for tools/list → 200 (key not yet used)", r.status, 200);
}

// 6. GET / → landing page
{
  const r = await fetch(`${base}/`);
  await expect("GET / → 200", r.status, 200);
  const ct = r.headers.get("content-type") ?? "";
  await expect("  Content-Type is HTML", ct.includes("text/html"), true);
}

// 7. GET /mcp/<key> → generic JSON (no key validation on GET)
{
  const r = await fetch(`${base}/mcp/${encodeURIComponent(KEY)}`);
  await expect("GET /mcp/<key> → 200 (ping)", r.status, 200);
}

console.log(`\n${pass} pass, ${fail} fail`);
server.close();
process.exit(fail > 0 ? 1 : 0);
