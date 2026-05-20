import { z } from "zod";
import type { TmsClient } from "../client.js";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.js";

interface TestPlan {
  id: string;
  human_id?: string | null;
  title: string;
  description?: string | null;
  created_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export const listTestPlansInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  search: z.string().optional().describe("Substring match on test plan title"),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListTestPlansArgs = z.object(listTestPlansInputSchema);

export async function listTestPlans(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListTestPlansArgs.parse(rawArgs);
  const res = await client.getList<TestPlan>(
    `/projects/${encodeURIComponent(args.project_id)}/test_plans`,
    {
      title__CONTAINS: args.search,
      page_size: args.page_size,
      cursor: args.cursor,
    },
  );

  const md = mdTable(
    ["Human ID", "Title", "UUID"],
    res.items.map((p) => [p.human_id ?? "—", p.title, p.id]),
  ) + paginationFooter(res.page_info);

  return hybrid({ test_plans: res.items, page_info: res.page_info }, md);
}

export const getTestPlanInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_plan_id: z.string().min(1).describe("Test plan UUID or human ID"),
};

const GetTestPlanArgs = z.object(getTestPlanInputSchema);

export async function getTestPlan(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = GetTestPlanArgs.parse(rawArgs);
  const plan = await client.getOne<TestPlan>(
    `/projects/${encodeURIComponent(args.project_id)}/test_plans/${encodeURIComponent(args.test_plan_id)}`,
  );

  const md = [
    `**${plan.human_id ?? plan.id} — ${plan.title}**`,
    plan.description ? `\n${plan.description}` : "",
    `\nUUID: \`${plan.id}\``,
  ]
    .filter(Boolean)
    .join("\n");

  return hybrid({ test_plan: plan }, md);
}
