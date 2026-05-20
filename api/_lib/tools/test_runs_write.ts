import { z } from "zod";
import type { TmsClient } from "../client.js";
import { defaultUser, resolveLookup, resolveTestCaseId } from "../resolve.js";
import { hybrid, mdTable, type HybridResponse } from "../format.js";

interface TestRun {
  id: string;
  human_id?: string | null;
  title: string;
  description?: string | null;
  status?: string; // "ACTIVE" | "CLOSED"
  selection_type?: "STATIC" | "DYNAMIC" | string;
  assignee_id?: string | null;
  start_date?: number | null;
  end_date?: number | null;
  project_id?: string;
  test_plan_id?: string | null;
  test_cases_count?: number;
  [k: string]: unknown;
}

const dynamicFilterSchema = z.object({
  field: z.string().describe("Field to filter on (e.g. 'folder_id', 'priority_id', 'status_id', 'label_ids')"),
  operator: z.string().describe("Comparison operator (e.g. 'EQUALS', 'IN', 'NOT_IN')"),
  values: z.array(z.string()).describe("Values to compare against (UUIDs)"),
});

// -------- create test run --------

export const createTestRunInputSchema = {
  project_id: z.string().min(1),
  title: z.string().min(1).describe("Test run title"),
  description: z.string().optional(),
  selection_type: z.enum(["STATIC", "DYNAMIC"]).describe(
    "STATIC = explicit list of TCs (use test_case_ids). DYNAMIC = rule-based filter (use dynamic_filters); TCs matching the filter are included automatically, including future TCs.",
  ),
  test_case_ids: z
    .array(z.string())
    .optional()
    .describe(
      "For STATIC: list of TC UUIDs or human IDs (e.g. ['GR-46','GR-47']). Required when selection_type=STATIC.",
    ),
  dynamic_filters: z
    .array(dynamicFilterSchema)
    .optional()
    .describe(
      "For DYNAMIC: filter rules. Empty array = include all TCs in project. Required (can be empty array) when selection_type=DYNAMIC.",
    ),
  excluded_test_case_ids: z
    .array(z.string())
    .optional()
    .describe("DYNAMIC only: TCs to exclude from the filter result"),
  start_date: z.number().int().optional().describe("Epoch MILLISECONDS"),
  end_date: z.number().int().optional().describe("Epoch MILLISECONDS"),
  assignee: z.string().optional().describe("User name/email or UUID. Defaults to first active user."),
  test_plan_id: z.string().optional().describe("Optional plan UUID to link this run to"),
  labels: z.array(z.string()).optional().describe("Label NAMES (note: this endpoint uses label_names, not label_ids)"),
};

const CreateRunArgs = z.object(createTestRunInputSchema);

export function makeCreateTestRun(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = CreateRunArgs.parse(rawArgs);

    const body: Record<string, unknown> = {
      title: args.title,
      project_id: args.project_id,
      status: "ACTIVE",
      selection_type: args.selection_type,
    };
    if (args.description !== undefined) body.description = args.description;
    if (args.start_date !== undefined) body.start_date = args.start_date;
    if (args.end_date !== undefined) body.end_date = args.end_date;
    if (args.test_plan_id !== undefined) body.test_plan_id = args.test_plan_id;
    if (args.labels !== undefined) body.label_names = args.labels;

    if (args.selection_type === "STATIC") {
      if (!args.test_case_ids || args.test_case_ids.length === 0) {
        throw new Error("STATIC selection requires test_case_ids");
      }
      const resolved: string[] = [];
      for (const id of args.test_case_ids) {
        resolved.push(await resolveTestCaseId(client, args.project_id, id));
      }
      body.static_selection_filters = [
        { field: "id", operator: "IN", values: resolved },
      ];
      body.dynamic_selection_filters = [];
    } else {
      body.dynamic_selection_filters = args.dynamic_filters ?? [];
      body.static_selection_filters = [];
      if (args.excluded_test_case_ids && args.excluded_test_case_ids.length > 0) {
        const excluded: string[] = [];
        for (const id of args.excluded_test_case_ids) {
          excluded.push(await resolveTestCaseId(client, args.project_id, id));
        }
        body.dynamic_selection_excluded_test_case_ids = excluded;
      }
    }

    body.assignee_id =
      args.assignee !== undefined
        ? await resolveLookup(client, apiKey, "user", args.assignee)
        : await defaultUser(client, apiKey);

    const created = await client.postOne<TestRun>(
      `/projects/${encodeURIComponent(args.project_id)}/test_runs`,
      body,
    );
    return hybrid(
      { test_run: created },
      [
        `✅ Created test run **${created.human_id ?? created.id} — ${created.title}**`,
        `Selection: \`${created.selection_type}\` · TCs: ${created.test_cases_count ?? "?"} · Status: \`${created.status}\``,
      ].join("\n"),
    );
  };
}

// -------- mark test run result --------

const resultEntrySchema = z.object({
  test_case_id: z.string().describe("TC UUID or human ID"),
  status: z.string().describe("Result status name (e.g. 'Passed', 'Failed', 'Blocked', 'Skipped', 'UnTested') or UUID"),
  description: z.string().optional().describe("Optional execution notes"),
  assignee: z.string().optional().describe("User who ran this TC (name/email/UUID). Defaults to first active user."),
});

export const markTestRunResultInputSchema = {
  project_id: z.string().min(1),
  test_run_id: z.string().min(1).describe("Test run UUID or human ID (e.g. GR-R-1)"),
  results: z
    .array(resultEntrySchema)
    .min(1)
    .describe("Per-TC results. Names (Passed/Failed/etc) are resolved to UUIDs."),
};

const MarkArgs = z.object(markTestRunResultInputSchema);

export function makeMarkTestRunResult(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = MarkArgs.parse(rawArgs);

    const defaultUserId = await defaultUser(client, apiKey);
    const entries: Array<Record<string, unknown>> = [];
    for (const r of args.results) {
      entries.push({
        test_case_id: await resolveTestCaseId(client, args.project_id, r.test_case_id),
        test_run_status_id: await resolveLookup(client, apiKey, "test_run_status", r.status),
        user_id:
          r.assignee !== undefined
            ? await resolveLookup(client, apiKey, "user", r.assignee)
            : defaultUserId,
        description: r.description ?? "",
      });
    }

    const data = JSON.stringify({ test_run_cases: entries });
    const path = `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}/test_cases`;
    await client.multipart<unknown>("PUT", path, { data });

    const md =
      `✅ Marked ${entries.length} result${entries.length === 1 ? "" : "s"} on run \`${args.test_run_id}\`\n\n` +
      mdTable(
        ["Test case", "Status"],
        args.results.map((r) => [r.test_case_id, r.status]),
      );

    return hybrid({ marked_count: entries.length, results: args.results }, md);
  };
}

// -------- delete test run --------

export const deleteTestRunInputSchema = {
  project_id: z.string().min(1),
  test_run_id: z.string().min(1).describe("Test run UUID or human ID"),
};

const DeleteRunArgs = z.object(deleteTestRunInputSchema);

export async function deleteTestRun(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = DeleteRunArgs.parse(rawArgs);
  await client.delete(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}`,
  );
  return hybrid(
    { deleted: true, test_run_id: args.test_run_id },
    `🗑️ Deleted test run \`${args.test_run_id}\``,
  );
}

// -------- close test run --------

export const closeTestRunInputSchema = {
  project_id: z.string().min(1),
  test_run_id: z.string().min(1).describe("Test run UUID or human ID"),
};

const CloseArgs = z.object(closeTestRunInputSchema);

export async function closeTestRun(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = CloseArgs.parse(rawArgs);
  const path = `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}`;
  // PUT /test_runs/{id} accepts a sparse body — only the fields you supply
  // are updated. For close we only need status. Server auto-fills closed_by.
  // Probed against both STATIC and DYNAMIC runs (2026-05-20).
  const updated = await client.putOne<TestRun>(path, { status: "CLOSED" });
  return hybrid(
    { test_run: updated },
    `🔒 Closed test run **${updated.human_id ?? updated.id} — ${updated.title}**`,
  );
}
