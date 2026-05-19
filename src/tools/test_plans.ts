import { z } from "zod";
import type { TmsClient, PaginatedResponse } from "../client.ts";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.ts";

interface TestPlan {
  id: string;
  human_id?: string | null;
  name: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export const listTestPlansInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  search: z.string().optional(),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListTestPlansArgs = z.object(listTestPlansInputSchema);

export async function listTestPlans(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListTestPlansArgs.parse(rawArgs);
  const res = await client.get<PaginatedResponse<TestPlan>>(
    `/projects/${encodeURIComponent(args.project_id)}/test_plans`,
    {
      name__CONTAINS: args.search,
      page_size: args.page_size,
      cursor: args.cursor,
    },
  );

  const md = mdTable(
    ["Human ID", "Name", "UUID"],
    res.data.map((p) => [p.human_id ?? "—", p.name, p.id]),
  ) + paginationFooter(res.page_info);

  return hybrid(res, md);
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
  const plan = await client.get<TestPlan>(
    `/projects/${encodeURIComponent(args.project_id)}/test_plans/${encodeURIComponent(args.test_plan_id)}`,
  );

  const md = [
    `**${plan.human_id ?? plan.id} — ${plan.name}**`,
    plan.description ? `\n${plan.description}` : "",
    `\nUUID: \`${plan.id}\``,
  ]
    .filter(Boolean)
    .join("\n");

  return hybrid(plan, md);
}
