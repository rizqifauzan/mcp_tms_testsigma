// End-to-end field mapping verification.
// Calls each TMS endpoint our tools use, dumps the response key structure
// (not values). Compares against what tools expect. Fails loudly on mismatch.
//
// Usage:
//   node --env-file=.env scripts/verify_e2e.mjs

const KEY = process.env.TMS_API_KEY;
if (!KEY) {
  console.error("ERROR: TMS_API_KEY not set in .env");
  process.exit(1);
}

const BASE = "https://test-management.testsigma.com/api/v1";

async function call(method, path, query) {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  const reqId = res.headers.get("x-tms-api-request-id");
  const ctype = res.headers.get("content-type") || "";
  const body = ctype.includes("json") ? await res.json() : await res.text();
  return { status: res.status, body, reqId, headers: Object.fromEntries(res.headers) };
}

function keysOf(obj) {
  if (Array.isArray(obj)) return obj.length ? `[${keysOf(obj[0])}, ...x${obj.length}]` : "[]";
  if (obj && typeof obj === "object") {
    return "{" + Object.keys(obj).map((k) => `${k}:${typeOfShallow(obj[k])}`).join(", ") + "}";
  }
  return typeof obj;
}

function typeOfShallow(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length ? `${typeOfShallow(v[0])}[]` : "[]";
  if (typeof v === "object") return "obj";
  return typeof v;
}

async function check(label, expectedKeys, fn) {
  process.stdout.write(`\n=== ${label} ===\n`);
  let res;
  try {
    res = await fn();
  } catch (err) {
    console.log(`  ✗ network error: ${err.message}`);
    return null;
  }
  console.log(`  HTTP ${res.status}  req_id=${res.reqId ?? "-"}`);
  if (res.status >= 400) {
    console.log(`  body: ${JSON.stringify(res.body).slice(0, 300)}`);
    return null;
  }
  const top = res.body;
  console.log(`  shape: ${keysOf(top)}`);
  // page_info presence
  if (top && typeof top === "object" && "page_info" in top) {
    console.log(`  page_info: ${keysOf(top.page_info)}`);
    if (Array.isArray(top.data) && top.data[0]) {
      console.log(`  item[0]: ${keysOf(top.data[0])}`);
    }
  }
  // field-name diff
  const sample = Array.isArray(top?.data) ? top.data[0] : top;
  if (sample && typeof sample === "object") {
    const actual = new Set(Object.keys(sample));
    const missing = expectedKeys.filter((k) => !actual.has(k));
    if (missing.length) console.log(`  ⚠ MISSING expected keys: ${missing.join(", ")}`);
  }
  return res;
}

// 1. Projects: probe list, then drill into first
const projects = await check(
  "GET /projects",
  ["id", "name"],
  () => call("GET", "/projects", { page_size: 5 }),
);

const projectId = projects?.body?.data?.[0]?.id;
if (!projectId) {
  console.log("\nNo projects available; stopping early.");
  process.exit(0);
}

const humanIdPrefix = projects?.body?.data?.[0]?.human_id_prefix;
console.log(`\nUsing project: ${projectId} (prefix=${humanIdPrefix ?? "?"})`);

await check("GET /projects/{id}", ["id", "name"], () =>
  call("GET", `/projects/${projectId}`),
);

await check(
  "GET /projects/{pid}/folders",
  ["id", "name", "parent_folder_id"],
  () => call("GET", `/projects/${projectId}/folders`, { page_size: 5 }),
);

const tcList = await check(
  "GET /projects/{pid}/test_cases",
  ["id", "name", "template_type"],
  () => call("GET", `/projects/${projectId}/test_cases`, { page_size: 3 }),
);

const tcId = tcList?.body?.data?.[0]?.id;
if (tcId) {
  await check(
    "GET /projects/{pid}/test_cases/{id}",
    ["id", "name", "template_type"],
    () => call("GET", `/projects/${projectId}/test_cases/${tcId}`),
  );
}

await check("GET /projects/{pid}/test_plans", ["id", "name"], () =>
  call("GET", `/projects/${projectId}/test_plans`, { page_size: 3 }),
);

await check("GET /projects/{pid}/test_runs", ["id", "name"], () =>
  call("GET", `/projects/${projectId}/test_runs`, { page_size: 3 }),
);

// Lookup tables
for (const path of [
  "/test_cases/statuses",
  "/test_cases/priorities",
  "/test_cases/types",
  "/test_cases/automation_types",
  "/test_runs/statuses",
]) {
  await check(`GET ${path}`, ["id", "name"], () => call("GET", path, { page_size: 50 }));
}

console.log("\n=== Done ===");
