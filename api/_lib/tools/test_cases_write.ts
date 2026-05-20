import { z } from "zod";
import type { TmsClient } from "../client.js";
import { defaultLookup, defaultUser, resolveLabels, resolveLookup } from "../resolve.js";
import { hybrid, mdTable, type HybridResponse } from "../format.js";

interface IndividualStep {
  order?: number;
  step_type?: string;
  step_description?: string;
  expected_results?: string;
  step_group_id?: string | null;
}

interface TestCase {
  id: string;
  human_id?: string | null;
  title: string;
  description?: string | null;
  preconditions?: string | null;
  steps?: string | null;
  expected_results?: string | null;
  folder_id?: string | null;
  template_type?: "TCD" | "STEPS" | string;
  status_id?: string | null;
  priority_id?: string | null;
  type_id?: string | null;
  automation_type_id?: string | null;
  owner_id?: string | null;
  reviewer_id?: string | null;
  label_ids?: string[] | null;
  individual_steps?: IndividualStep[] | null;
  [k: string]: unknown;
}

const stepSchema = z.object({
  order: z.number().optional(),
  step_type: z.string().optional(),
  step_description: z.string(),
  expected_results: z.string().optional(),
  step_group_id: z.string().nullable().optional(),
});

const writableFields = {
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.string().optional().describe("Newline-delimited text blob; required when template_type='TCD'"),
  expected_results: z.string().optional().describe("Newline-delimited text blob; paired with steps for TCD template"),
  template_type: z.enum(["TCD", "STEPS"]).optional(),
  folder_id: z.string().optional().describe("Target folder UUID"),
  status: z.string().optional().describe("Status name (e.g. 'Draft', 'Ready') or UUID"),
  priority: z.string().optional().describe("Priority name (e.g. 'Major', 'Minor') or UUID"),
  type: z.string().optional().describe("Type name or UUID"),
  automation_type: z.string().optional().describe("Automation type name or UUID"),
  owner: z.string().optional().describe("Owner user name/email or UUID"),
  reviewer: z.string().optional().describe("Reviewer user name/email or UUID"),
  labels: z.array(z.string()).optional().describe("Label names or UUIDs"),
  individual_steps: z.array(stepSchema).optional().describe("Only for template_type='STEPS'"),
};

type WritableFields = z.infer<z.ZodObject<typeof writableFields>>;

async function buildPayload(
  client: TmsClient,
  apiKey: string,
  projectId: string,
  fields: WritableFields,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { project_id: projectId };

  if (fields.title !== undefined) out.title = fields.title;
  if (fields.description !== undefined) out.description = fields.description;
  if (fields.preconditions !== undefined) out.preconditions = fields.preconditions;
  if (fields.steps !== undefined) out.steps = fields.steps;
  if (fields.expected_results !== undefined) out.expected_results = fields.expected_results;
  if (fields.template_type !== undefined) out.template_type = fields.template_type;
  if (fields.folder_id !== undefined) out.folder_id = fields.folder_id;
  if (fields.individual_steps !== undefined) out.individual_steps = fields.individual_steps;

  if (fields.status !== undefined)
    out.status_id = await resolveLookup(client, apiKey, "test_case_status", fields.status);
  if (fields.priority !== undefined)
    out.priority_id = await resolveLookup(client, apiKey, "test_case_priority", fields.priority);
  if (fields.type !== undefined)
    out.type_id = await resolveLookup(client, apiKey, "test_case_type", fields.type);
  if (fields.automation_type !== undefined)
    out.automation_type_id = await resolveLookup(client, apiKey, "test_case_automation_type", fields.automation_type);
  if (fields.owner !== undefined)
    out.owner_id = await resolveLookup(client, apiKey, "user", fields.owner);
  if (fields.reviewer !== undefined)
    out.reviewer_id = await resolveLookup(client, apiKey, "user", fields.reviewer);
  if (fields.labels !== undefined)
    out.label_ids = await resolveLabels(client, apiKey, fields.labels);

  return out;
}

// -------- create --------

export const createTestCaseInputSchema = {
  project_id: z.string().min(1).describe("Project UUID where the test case will live"),
  title: z.string().min(1).describe("Test case title"),
  folder_id: z.string().min(1).describe("Folder UUID — every TC must belong to a folder"),
  template_type: z.enum(["TCD", "STEPS"]).default("TCD").describe("TCD = single text blob (default, GROW convention). STEPS = structured individual_steps array."),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.string().optional().describe("For TCD: newline-delimited action lines"),
  expected_results: z.string().optional().describe("For TCD: newline-delimited expected outcomes"),
  individual_steps: z.array(stepSchema).optional().describe("For STEPS: structured step array"),
  status: z.string().optional(),
  priority: z.string().optional(),
  type: z.string().optional(),
  automation_type: z.string().optional(),
  owner: z.string().optional(),
  reviewer: z.string().optional(),
  labels: z.array(z.string()).optional(),
};

const CreateArgs = z.object(createTestCaseInputSchema);

export function makeCreateTestCase(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = CreateArgs.parse(rawArgs);
    const payload = await buildPayload(client, apiKey, args.project_id, args);
    payload.title = args.title;
    payload.folder_id = args.folder_id;
    payload.template_type = args.template_type;

    // TMS requires status_id, priority_id, type_id, automation_type_id, owner_id
    // on create. Fill any that the user omitted with sensible defaults.
    if (payload.status_id === undefined) {
      payload.status_id = await defaultLookup(client, apiKey, "test_case_status", ["Draft"]);
    }
    if (payload.priority_id === undefined) {
      payload.priority_id = await defaultLookup(client, apiKey, "test_case_priority", [
        "Medium",
        "Major",
      ]);
    }
    if (payload.type_id === undefined) {
      payload.type_id = await defaultLookup(client, apiKey, "test_case_type", ["Functional"]);
    }
    if (payload.automation_type_id === undefined) {
      payload.automation_type_id = await defaultLookup(
        client,
        apiKey,
        "test_case_automation_type",
        ["Manual"],
      );
    }
    if (payload.owner_id === undefined) {
      payload.owner_id = await defaultUser(client, apiKey);
    }

    const created = await client.postOne<TestCase>(
      `/projects/${encodeURIComponent(args.project_id)}/test_cases`,
      payload,
    );

    const md = [
      `✅ Created **${created.human_id ?? created.id} — ${created.title}**`,
      `Template: \`${created.template_type ?? args.template_type}\` · Folder: \`${created.folder_id ?? args.folder_id}\``,
      `UUID: \`${created.id}\``,
    ].join("\n");

    return hybrid({ test_case: created }, md);
  };
}

// -------- update --------

export const updateTestCaseInputSchema = {
  project_id: z.string().min(1),
  test_case_id: z.string().min(1).describe("Test case UUID or human ID (e.g. GR-7)"),
  ...writableFields,
};

const UpdateArgs = z.object(updateTestCaseInputSchema);

export function makeUpdateTestCase(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = UpdateArgs.parse(rawArgs);
    const { project_id, test_case_id, ...fields } = args;

    const path = `/projects/${encodeURIComponent(project_id)}/test_cases/${encodeURIComponent(test_case_id)}`;

    // Fetch current state, merge partial fields, PUT full body.
    const current = await client.getOne<TestCase>(path);
    const patch = await buildPayload(client, apiKey, project_id, fields);

    const merged: Record<string, unknown> = {
      ...current,
      ...patch,
      project_id,
    };
    // Strip read-only / server-managed fields from the merged body.
    for (const k of ["id", "human_id", "created_at", "updated_at", "labels"]) {
      delete merged[k];
    }

    const updated = await client.putOne<TestCase>(path, merged);
    return hybrid(
      { test_case: updated },
      `✅ Updated **${updated.human_id ?? updated.id} — ${updated.title}**`,
    );
  };
}

// -------- delete --------

export const deleteTestCaseInputSchema = {
  project_id: z.string().min(1),
  test_case_id: z.string().min(1).describe("Test case UUID or human ID"),
};

const DeleteArgs = z.object(deleteTestCaseInputSchema);

export async function deleteTestCase(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = DeleteArgs.parse(rawArgs);
  await client.delete(
    `/projects/${encodeURIComponent(args.project_id)}/test_cases/${encodeURIComponent(args.test_case_id)}`,
  );
  return hybrid(
    { deleted: true, test_case_id: args.test_case_id },
    `🗑️ Deleted test case \`${args.test_case_id}\``,
  );
}

// -------- bulk update --------

export const bulkUpdateTestCasesInputSchema = {
  project_id: z.string().min(1),
  test_case_ids: z
    .array(z.string().min(1))
    .min(1)
    .describe("Array of test case UUIDs or human IDs to update"),
  ...writableFields,
};

const BulkArgs = z.object(bulkUpdateTestCasesInputSchema);

export function makeBulkUpdateTestCases(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = BulkArgs.parse(rawArgs);
    const { project_id, test_case_ids, ...fields } = args;

    const succeeded: Array<{ id: string; human_id?: string | null; title: string }> = [];
    const failed: Array<{ id: string; reason: string }> = [];

    // Sequential to stay under ~10 req/sec.
    for (const tcId of test_case_ids) {
      const path = `/projects/${encodeURIComponent(project_id)}/test_cases/${encodeURIComponent(tcId)}`;
      try {
        const current = await client.getOne<TestCase>(path);
        const patch = await buildPayload(client, apiKey, project_id, fields);
        const merged: Record<string, unknown> = { ...current, ...patch, project_id };
        for (const k of ["id", "human_id", "created_at", "updated_at", "labels"]) {
          delete merged[k];
        }
        const updated = await client.putOne<TestCase>(path, merged);
        succeeded.push({ id: updated.id, human_id: updated.human_id, title: updated.title });
      } catch (err) {
        failed.push({ id: tcId, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const md =
      `**Bulk update: ${succeeded.length} succeeded, ${failed.length} failed**\n\n` +
      (succeeded.length > 0
        ? `**Succeeded**\n${mdTable(["Human ID", "Title", "UUID"], succeeded.map((s) => [s.human_id ?? "—", s.title, s.id]))}\n\n`
        : "") +
      (failed.length > 0
        ? `**Failed**\n${mdTable(["Input ID", "Reason"], failed.map((f) => [f.id, f.reason]))}`
        : "");

    return hybrid({ succeeded, failed }, md.trim());
  };
}
