import { z } from "zod";
import type { TmsClient } from "../client.js";
import { resolveLabels } from "../resolve.js";
import { hybrid, type HybridResponse } from "../format.js";

interface TestPlan {
  id: string;
  human_id?: string | null;
  title: string;
  description?: string | null;
  status?: string;
  start_date?: number | null;
  end_date?: number | null;
  project_id?: string;
  test_runs_count?: number;
  test_cases_count?: number;
  [k: string]: unknown;
}

// -------- create --------

export const createTestPlanInputSchema = {
  project_id: z.string().min(1),
  title: z.string().min(1).describe("Test plan title (required)"),
  description: z.string().optional(),
  start_date: z
    .number()
    .int()
    .optional()
    .describe("Start date as epoch MILLISECONDS (e.g. Date.now())"),
  end_date: z.number().int().optional().describe("End date as epoch MILLISECONDS"),
  labels: z.array(z.string()).optional().describe("Label names or UUIDs"),
};

const CreateArgs = z.object(createTestPlanInputSchema);

export function makeCreateTestPlan(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = CreateArgs.parse(rawArgs);
    const body: Record<string, unknown> = { title: args.title };
    if (args.description !== undefined) body.description = args.description;
    if (args.start_date !== undefined) body.start_date = args.start_date;
    if (args.end_date !== undefined) body.end_date = args.end_date;
    if (args.labels !== undefined && args.labels.length > 0) {
      body.label_ids = await resolveLabels(client, apiKey, args.labels);
    }

    const created = await client.postOne<TestPlan>(
      `/projects/${encodeURIComponent(args.project_id)}/test_plans`,
      body,
    );
    return hybrid(
      { test_plan: created },
      `✅ Created test plan **${created.human_id ?? created.id} — ${created.title}**`,
    );
  };
}

// -------- update --------

export const updateTestPlanInputSchema = {
  project_id: z.string().min(1),
  test_plan_id: z.string().min(1).describe("Plan UUID or human ID (e.g. GR-P-1)"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  start_date: z.number().int().optional(),
  end_date: z.number().int().optional(),
  labels: z.array(z.string()).optional(),
};

const UpdateArgs = z.object(updateTestPlanInputSchema);

export function makeUpdateTestPlan(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = UpdateArgs.parse(rawArgs);
    const { project_id, test_plan_id, ...fields } = args;
    if (
      fields.title === undefined &&
      fields.description === undefined &&
      fields.start_date === undefined &&
      fields.end_date === undefined &&
      fields.labels === undefined
    ) {
      throw new Error("update_test_plan requires at least one field to change");
    }

    const path = `/projects/${encodeURIComponent(project_id)}/test_plans/${encodeURIComponent(test_plan_id)}`;
    const current = await client.getOne<TestPlan>(path);

    const merged: Record<string, unknown> = { ...current };
    if (fields.title !== undefined) merged.title = fields.title;
    if (fields.description !== undefined) merged.description = fields.description;
    if (fields.start_date !== undefined) merged.start_date = fields.start_date;
    if (fields.end_date !== undefined) merged.end_date = fields.end_date;
    if (fields.labels !== undefined) {
      merged.label_ids = await resolveLabels(client, apiKey, fields.labels);
    }
    for (const k of ["id", "human_id", "created_at", "updated_at", "labels", "test_runs_count", "test_cases_count"]) {
      delete merged[k];
    }

    const updated = await client.putOne<TestPlan>(path, merged);
    return hybrid(
      { test_plan: updated },
      `✅ Updated test plan **${updated.human_id ?? updated.id} — ${updated.title}**`,
    );
  };
}

// -------- delete --------

export const deleteTestPlanInputSchema = {
  project_id: z.string().min(1),
  test_plan_id: z.string().min(1).describe("Plan UUID or human ID"),
};

const DeleteArgs = z.object(deleteTestPlanInputSchema);

export async function deleteTestPlan(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = DeleteArgs.parse(rawArgs);
  await client.delete(
    `/projects/${encodeURIComponent(args.project_id)}/test_plans/${encodeURIComponent(args.test_plan_id)}`,
  );
  return hybrid(
    { deleted: true, test_plan_id: args.test_plan_id },
    `🗑️ Deleted test plan \`${args.test_plan_id}\``,
  );
}
