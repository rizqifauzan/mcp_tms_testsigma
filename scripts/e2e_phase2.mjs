// Phase 2 end-to-end: exercise the 8 write tools against a real TMS account.
//
// Strategy: create a temporary folder + TC, run updates + bulk update,
// then clean up by deleting both. Net-zero state change on success.
// Test artifacts use a timestamp prefix to avoid name collisions.
//
//   npm run e2e:phase2

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../api/_lib/server.js";

const KEY = process.env.TMS_API_KEY;
if (!KEY) {
  console.error("ERROR: TMS_API_KEY not set");
  process.exit(1);
}

const GROW_PROJECT_ID = "82967cfe-5847-4b9b-a3c0-718262947900";
const STAMP = `mcp-e2e-${Date.now()}`;

const server = buildServer(KEY);
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st);
const client = new Client({ name: "phase2-e2e", version: "0.0.0" }, { capabilities: {} });
await client.connect(ct);

let createdFolderId = null;
let createdTcIds = [];

async function call(label, name, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "(no text)";
  const isError = res.isError || (res.structuredContent && "error" in res.structuredContent);
  console.log(isError ? "❌ ERROR" : "✅ OK");
  console.log(text.slice(0, 500));
  if (isError) {
    throw new Error(`Tool ${name} failed: ${JSON.stringify(res.structuredContent)}`);
  }
  return res;
}

try {
  // 1. Create folder
  const folderRes = await call(
    "create_folder",
    "create_folder",
    { project_id: GROW_PROJECT_ID, name: `${STAMP}-folder` },
  );
  createdFolderId = folderRes.structuredContent.folder.id;

  // 2. Update folder (rename)
  await call(
    "update_folder",
    "update_folder",
    { project_id: GROW_PROJECT_ID, folder_id: createdFolderId, name: `${STAMP}-folder-renamed` },
  );

  // 3. Create test case (TCD template — GROW convention)
  const tc1Res = await call(
    "create_test_case",
    "create_test_case",
    {
      project_id: GROW_PROJECT_ID,
      folder_id: createdFolderId,
      title: `${STAMP}-tc-1`,
      description: "E2E test — safe to delete",
      preconditions: "User is logged in",
      steps: "Step 1\nStep 2",
      expected_results: "Result 1\nResult 2",
    },
  );
  createdTcIds.push(tc1Res.structuredContent.test_case.id);

  // 4. Update test case (status by NAME — exercises resolver)
  await call(
    "update_test_case",
    "update_test_case",
    {
      project_id: GROW_PROJECT_ID,
      test_case_id: createdTcIds[0],
      status: "Ready",
      description: "Updated by E2E test",
    },
  );

  // 5. Create a second TC for bulk update test
  const tc2Res = await call(
    "create_test_case (second)",
    "create_test_case",
    {
      project_id: GROW_PROJECT_ID,
      folder_id: createdFolderId,
      title: `${STAMP}-tc-2`,
      description: "Second E2E TC",
    },
  );
  createdTcIds.push(tc2Res.structuredContent.test_case.id);

  // 6. Bulk update — set priority on both TCs
  await call(
    "bulk_update_test_cases",
    "bulk_update_test_cases",
    {
      project_id: GROW_PROJECT_ID,
      test_case_ids: createdTcIds,
      priority: "Minor",
    },
  );

  // 7. Verify by reading back
  const verify = await call(
    "get_test_case (verify)",
    "get_test_case",
    { project_id: GROW_PROJECT_ID, test_case_id: createdTcIds[0] },
  );
  const tc = verify.structuredContent.test_case;
  console.log(`\nVerified: status_id=${tc.status_id}, priority_id=${tc.priority_id}, description="${tc.description}"`);
} catch (err) {
  console.error("\n❌ TEST FAILED:", err.message);
} finally {
  // Cleanup — delete in reverse creation order
  console.log("\n=== Cleanup ===");
  for (const id of createdTcIds) {
    try {
      await call(`delete_test_case ${id}`, "delete_test_case", {
        project_id: GROW_PROJECT_ID,
        test_case_id: id,
      });
    } catch (e) {
      console.error(`  failed to delete TC ${id}:`, e.message);
    }
  }
  if (createdFolderId) {
    try {
      await call("delete_folder", "delete_folder", {
        project_id: GROW_PROJECT_ID,
        folder_id: createdFolderId,
      });
    } catch (e) {
      console.error(`  failed to delete folder:`, e.message);
    }
  }
  await client.close();
  await server.close();
  console.log("\n=== Phase 2 E2E complete ===");
}
