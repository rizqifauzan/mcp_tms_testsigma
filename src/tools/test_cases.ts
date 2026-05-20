import { z } from "zod";
import type { TmsClient } from "../client.js";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.js";

interface Label {
  id: string;
  name: string;
  [k: string]: unknown;
}

interface IndividualStep {
  order?: number;
  step_type?: string;
  step_description?: string;
  expected_results?: string;
  description?: string;
  expected_result?: string;
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
  labels?: Label[] | null;
  individual_steps?: IndividualStep[] | null;
  created_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export const listTestCasesInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  folder_id: z.string().optional().describe("Filter by folder UUID"),
  search: z.string().optional().describe("Substring match on test case title"),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListTestCasesArgs = z.object(listTestCasesInputSchema);

export async function listTestCases(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListTestCasesArgs.parse(rawArgs);
  const res = await client.getList<TestCase>(
    `/projects/${encodeURIComponent(args.project_id)}/test_cases`,
    {
      folder_id: args.folder_id,
      title__CONTAINS: args.search,
      page_size: args.page_size,
      cursor: args.cursor,
    },
  );

  const md = mdTable(
    ["Human ID", "Title", "Template", "UUID"],
    res.items.map((tc) => [tc.human_id ?? "—", tc.title, tc.template_type ?? "—", tc.id]),
  ) + paginationFooter(res.page_info);

  return hybrid({ test_cases: res.items, page_info: res.page_info }, md);
}

export const getTestCaseInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_case_id: z.string().min(1).describe("Test case UUID or human ID (e.g. GR-7)"),
};

const GetTestCaseArgs = z.object(getTestCaseInputSchema);

export async function getTestCase(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = GetTestCaseArgs.parse(rawArgs);
  const tc = await client.getOne<TestCase>(
    `/projects/${encodeURIComponent(args.project_id)}/test_cases/${encodeURIComponent(args.test_case_id)}`,
  );

  return hybrid({ test_case: tc }, renderTestCase(tc));
}

function renderTestCase(tc: TestCase): string {
  const header = `**${tc.human_id ?? tc.id} — ${tc.title}**`;
  const labels = tc.labels && tc.labels.length > 0 ? ` · Labels: ${tc.labels.map((l) => `\`${l.name}\``).join(", ")}` : "";
  const meta = `Template: \`${tc.template_type ?? "?"}\` · Folder: \`${tc.folder_id ?? "root"}\`${labels}`;
  const sections: string[] = [header, meta];

  if (tc.description) sections.push(`\n**Description**\n${tc.description}`);
  if (tc.preconditions) sections.push(`\n**Preconditions**\n${tc.preconditions}`);

  if (tc.template_type === "STEPS" && tc.individual_steps && tc.individual_steps.length > 0) {
    const lines = tc.individual_steps
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s, i) => {
        const num = s.order ?? i + 1;
        const desc = s.step_description ?? s.description ?? "(no description)";
        const expected = s.expected_results ?? s.expected_result;
        return `${num}. ${desc}${expected ? `\n   _Expected:_ ${expected}` : ""}`;
      });
    sections.push(`\n**Steps**\n${lines.join("\n")}`);
  } else {
    if (tc.steps) sections.push(`\n**Steps**\n${tc.steps}`);
    if (tc.expected_results) sections.push(`\n**Expected Results**\n${tc.expected_results}`);
  }

  return sections.join("\n");
}
