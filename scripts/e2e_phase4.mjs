// Phase 4 end-to-end: exercise the 6 new write tools.
//
// Strategy: create temp folder + 2 TCs (for STATIC selection), create plan,
// create STATIC run, mark results, close run, then delete everything.
// Net-zero state change on success.
//
//   npm run e2e:phase4

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../api/_lib/server.js";

const KEY = process.env.TMS_API_KEY;
if (!KEY) {
  console.error("ERROR: TMS_API_KEY not set");
  process.exit(1);
}

const GROW_PROJECT_ID = "82967cfe-5847-4b9b-a3c0-718262947900";
const STAMP = `mcp-e2e4-${Date.now()}`;

const server = buildServer(KEY);
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st);
const client = new Client({ name: "phase4-e2e", version: "0.0.0" }, { capabilities: {} });
await client.connect(ct);

let folderId = null;
const tcIds = [];
let planId = null;
const runIds = [];

async function call(label, name, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "(no text)";
  const isError = res.isError || (res.structuredContent && "error" in res.structuredContent);
  console.log(isError ? "❌ ERROR" : "✅ OK");
  console.log(text.slice(0, 600));
  if (isError) throw new Error(`Tool ${name} failed: ${JSON.stringify(res.structuredContent)}`);
  return res;
}

try {
  // Setup: folder + 2 TCs to exercise STATIC selection
  const folderRes = await call("create_folder (setup)", "create_folder", {
    project_id: GROW_PROJECT_ID,
    name: `${STAMP}-folder`,
  });
  folderId = folderRes.structuredContent.folder.id;

  for (const n of [1, 2]) {
    const tcRes = await call(`create_test_case ${n} (setup)`, "create_test_case", {
      project_id: GROW_PROJECT_ID,
      folder_id: folderId,
      title: `${STAMP}-tc-${n}`,
      description: "E2E phase 4",
    });
    tcIds.push(tcRes.structuredContent.test_case.id);
  }

  // 1. create_test_plan
  const planRes = await call("create_test_plan", "create_test_plan", {
    project_id: GROW_PROJECT_ID,
    title: `${STAMP}-plan`,
    description: "E2E phase 4 plan",
  });
  planId = planRes.structuredContent.test_plan.id;

  // 2. update_test_plan
  await call("update_test_plan", "update_test_plan", {
    project_id: GROW_PROJECT_ID,
    test_plan_id: planId,
    description: "Updated plan description",
    start_date: Date.now(),
    end_date: Date.now() + 7 * 24 * 3600 * 1000,
  });

  // 3. create_test_run (STATIC, linked to plan, TC by UUID)
  const runRes = await call("create_test_run (STATIC)", "create_test_run", {
    project_id: GROW_PROJECT_ID,
    title: `${STAMP}-run-static`,
    selection_type: "STATIC",
    test_case_ids: tcIds,
    test_plan_id: planId,
    start_date: Date.now(),
    end_date: Date.now() + 24 * 3600 * 1000,
  });
  const runId = runRes.structuredContent.test_run.id;
  runIds.push(runId);
  console.log(`  → test_cases_count: ${runRes.structuredContent.test_run.test_cases_count}`);

  // 4. mark_test_run_result (multiple TCs, by name "Passed"/"Failed")
  await call("mark_test_run_result", "mark_test_run_result", {
    project_id: GROW_PROJECT_ID,
    test_run_id: runId,
    results: [
      { test_case_id: tcIds[0], status: "Passed", description: "All good" },
      { test_case_id: tcIds[1], status: "Failed", description: "Step 2 broke" },
    ],
  });

  // 5. close_test_run
  await call("close_test_run", "close_test_run", {
    project_id: GROW_PROJECT_ID,
    test_run_id: runId,
  });

  // Verify run is CLOSED
  const verify = await call("get_test_run (verify CLOSED)", "get_test_run", {
    project_id: GROW_PROJECT_ID,
    test_run_id: runId,
  });
  const run = verify.structuredContent.test_run;
  console.log(`\nVerified: status=${run.status}, closed_by=${run.closed_by}`);

  // Bonus: create a DYNAMIC run scoped to our temp folder to test that path
  const dynRunRes = await call("create_test_run (DYNAMIC)", "create_test_run", {
    project_id: GROW_PROJECT_ID,
    title: `${STAMP}-run-dynamic`,
    selection_type: "DYNAMIC",
    dynamic_filters: [
      { field: "folder_id", operator: "EQUALS", values: [folderId] },
    ],
  });
  const dynRunId = dynRunRes.structuredContent.test_run.id;
  runIds.push(dynRunId);
  console.log(`  → DYNAMIC run TC count: ${dynRunRes.structuredContent.test_run.test_cases_count}`);
  // Close DYNAMIC run too — exercises the null-stripping fix in close handler
  await call("close_test_run (dyn)", "close_test_run", {
    project_id: GROW_PROJECT_ID,
    test_run_id: dynRunId,
  });

  // 6. delete_test_plan (drops linkage; runs remain orphaned, see cleanup)
  await call("delete_test_plan", "delete_test_plan", {
    project_id: GROW_PROJECT_ID,
    test_plan_id: planId,
  });
  planId = null;
} catch (err) {
  console.error("\n❌ TEST FAILED:", err.message);
} finally {
  console.log("\n=== Cleanup ===");
  for (const rid of runIds) {
    try {
      await call(`delete_test_run ${rid}`, "delete_test_run", {
        project_id: GROW_PROJECT_ID,
        test_run_id: rid,
      });
    } catch (e) {
      console.error(`  cleanup run ${rid} failed:`, e.message);
    }
  }
  if (planId) {
    try {
      await call("delete_test_plan (cleanup)", "delete_test_plan", {
        project_id: GROW_PROJECT_ID,
        test_plan_id: planId,
      });
    } catch (e) {
      console.error("  cleanup plan failed:", e.message);
    }
  }
  for (const tcId of tcIds) {
    try {
      await call(`delete_test_case ${tcId}`, "delete_test_case", {
        project_id: GROW_PROJECT_ID,
        test_case_id: tcId,
      });
    } catch (e) {
      console.error(`  cleanup TC ${tcId} failed:`, e.message);
    }
  }
  if (folderId) {
    try {
      await call("delete_folder (cleanup)", "delete_folder", {
        project_id: GROW_PROJECT_ID,
        folder_id: folderId,
      });
    } catch (e) {
      console.error("  cleanup folder failed:", e.message);
    }
  }
  await client.close();
  await server.close();
  console.log("\n=== Phase 4 E2E complete ===");
}
