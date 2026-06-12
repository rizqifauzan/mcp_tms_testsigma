import { z } from "zod";
import type { TmsClient } from "../client.js";
import { nameMapFor, userNameMap } from "../resolve.js";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.js";

interface StatusSummary {
  status_id?: string;
  status_name?: string;
  count?: number;
}

interface TestRun {
  id: string;
  human_id?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  test_plan_id?: string | null;
  selection_type?: string | null;
  assignee_id?: string | null;
  test_cases_count?: number | null;
  start_date?: number | null;
  end_date?: number | null;
  test_run_status_summary?: StatusSummary[] | null;
  created_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export const listTestRunsInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_plan_id: z.string().optional().describe("Filter by parent test plan UUID"),
  search: z.string().optional().describe("Substring match on test run title"),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListTestRunsArgs = z.object(listTestRunsInputSchema);

export async function listTestRuns(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListTestRunsArgs.parse(rawArgs);
  const res = await client.getList<TestRun>(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs`,
    {
      test_plan_id: args.test_plan_id,
      title__CONTAINS: args.search,
      page_size: args.page_size,
      cursor: args.cursor,
    },
  );

  const md = mdTable(
    ["Human ID", "Title", "Status", "Cases", "UUID"],
    res.items.map((r) => [
      r.human_id ?? "—",
      r.title,
      r.status ?? "—",
      r.test_cases_count ?? "—",
      r.id,
    ]),
  ) + paginationFooter(res.page_info);

  return hybrid({ test_runs: res.items, page_info: res.page_info }, md);
}

export const getTestRunInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_run_id: z.string().min(1).describe("Test run UUID or human ID"),
};

const GetTestRunArgs = z.object(getTestRunInputSchema);

export async function getTestRun(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = GetTestRunArgs.parse(rawArgs);
  const run = await client.getOne<TestRun>(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}`,
  );

  const sections: string[] = [`**${run.human_id ?? run.id} — ${run.title}**`];
  if (run.description) sections.push(`\n${run.description}`);
  sections.push(
    `\nStatus: \`${run.status ?? "—"}\` · Selection: \`${run.selection_type ?? "—"}\` · Cases: ${run.test_cases_count ?? "—"}`,
  );

  if (run.test_run_status_summary && run.test_run_status_summary.length > 0) {
    const summaryMd = mdTable(
      ["Status", "Count"],
      run.test_run_status_summary.map((s) => [s.status_name ?? s.status_id ?? "—", s.count ?? 0]),
    );
    sections.push(`\n**Result Summary**\n${summaryMd}`);
  }

  return hybrid({ test_run: run }, sections.join("\n"));
}

interface TestRunCase {
  id?: string;
  test_case_id?: string | null;
  test_case_human_id?: string | null;
  test_case_title?: string | null;
  title?: string | null;
  test_run_status_id?: string | null;
  status?: string | null;
  status_name?: string | null;
  user_id?: string | null;
  description?: string | null;
  executed_at?: number | null;
  updated_at?: number | null;
  [k: string]: unknown;
}

export const getTestRunResultsInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_run_id: z.string().min(1).describe("Test run UUID or human ID (e.g. GR-R-1)"),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const GetTestRunResultsArgs = z.object(getTestRunResultsInputSchema);

export function makeGetTestRunResults(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = GetTestRunResultsArgs.parse(rawArgs);
    const basePath = `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}`;

    // Fetch the run (for overall status + summary), the per-TC results, and the
    // lookup maps to translate status/user UUIDs into readable names. These are
    // independent so we issue them together.
    const [run, results, statusNames, userNames] = await Promise.all([
      client.getOne<TestRun>(basePath),
      client.getList<TestRunCase>(`${basePath}/test_cases`, {
        page_size: args.page_size,
        cursor: args.cursor,
      }),
      nameMapFor(client, apiKey, "test_run_status").catch(() => new Map<string, string>()),
      userNameMap(client, apiKey).catch(() => new Map<string, string>()),
    ]);

    const statusOf = (c: TestRunCase): string => {
      if (c.status_name) return c.status_name;
      if (c.test_run_status_id && statusNames.has(c.test_run_status_id)) {
        return statusNames.get(c.test_run_status_id)!;
      }
      return c.status ?? "UnTested";
    };

    const sections: string[] = [
      `**Results — ${run.human_id ?? run.id} — ${run.title}**`,
      `\nRun status: \`${run.status ?? "—"}\` · Cases: ${run.test_cases_count ?? results.items.length}`,
    ];

    if (run.test_run_status_summary && run.test_run_status_summary.length > 0) {
      const summaryMd = mdTable(
        ["Status", "Count"],
        run.test_run_status_summary.map((s) => [s.status_name ?? s.status_id ?? "—", s.count ?? 0]),
      );
      sections.push(`\n**Result Summary**\n${summaryMd}`);
    }

    const resultsMd = mdTable(
      ["Test Case", "Result", "Executed By", "Notes"],
      results.items.map((c) => [
        c.test_case_human_id ?? c.test_case_title ?? c.title ?? c.test_case_id ?? "—",
        statusOf(c),
        c.user_id ? userNames.get(c.user_id) ?? c.user_id : "—",
        c.description ?? "—",
      ]),
    );
    sections.push(`\n**Per-Test-Case Results**\n${resultsMd}${paginationFooter(results.page_info)}`);

    return hybrid(
      {
        test_run: { id: run.id, human_id: run.human_id, title: run.title, status: run.status },
        test_run_status_summary: run.test_run_status_summary ?? [],
        test_run_cases: results.items,
        page_info: results.page_info,
      },
      sections.join("\n"),
    );
  };
}
