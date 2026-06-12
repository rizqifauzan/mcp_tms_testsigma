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

// The per-run test_cases endpoint nests the TC under a `test_case` object and
// returns the result status as a readable `status` string (plus `status_id`
// UUID). The executor lives in `assignee` (object) / `assignee_id` (UUID).
// Field names verified against a live GR-R-23 response (2026-06).
interface RunCaseUser {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  [k: string]: unknown;
}

interface NestedTestCase {
  id?: string;
  human_id?: string | null;
  title?: string | null;
  [k: string]: unknown;
}

interface TestRunCase {
  id?: string;
  status?: string | null; // readable result name, e.g. "Passed"
  status_id?: string | null; // result status UUID
  assignee_id?: string | null;
  assignee?: RunCaseUser | null;
  description?: string | null;
  test_case?: NestedTestCase | null;
  [k: string]: unknown;
}

function runCaseUserName(u: RunCaseUser): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.email || u.id || "—";
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

    // Fetch the run (for overall status) and the per-TC results, plus the
    // lookup maps used as fallbacks when a record only carries UUIDs. These
    // are independent so we issue them together.
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
      if (c.status) return c.status;
      if (c.status_id && statusNames.has(c.status_id)) return statusNames.get(c.status_id)!;
      return "UnTested";
    };

    const caseNameOf = (c: TestRunCase): string =>
      c.test_case?.human_id ?? c.test_case?.title ?? c.test_case?.id ?? c.id ?? "—";

    const executorOf = (c: TestRunCase): string => {
      if (c.assignee) return runCaseUserName(c.assignee);
      if (c.assignee_id) return userNames.get(c.assignee_id) ?? c.assignee_id;
      return "—";
    };

    // The run detail's test_run_status_summary comes back null/empty for many
    // runs, so derive the per-status counts from the case list ourselves.
    const counts = new Map<string, number>();
    for (const c of results.items) {
      const s = statusOf(c);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const summary = [...counts.entries()].map(([status_name, count]) => ({ status_name, count }));

    const hasNotes = results.items.some((c) => c.description && c.description.trim().length > 0);

    const sections: string[] = [
      `**Results — ${run.human_id ?? run.id} — ${run.title}**`,
      `\nRun status: \`${run.status ?? "—"}\` · Cases: ${run.test_cases_count ?? results.page_info.total_count}`,
    ];

    if (summary.length > 0) {
      const summaryMd = mdTable(
        ["Status", "Count"],
        summary.map((s) => [s.status_name, s.count]),
      );
      sections.push(`\n**Result Summary**\n${summaryMd}`);
    }

    const headers = hasNotes
      ? ["Test Case", "Result", "Executed By", "Notes"]
      : ["Test Case", "Result", "Executed By"];
    const resultsMd = mdTable(
      headers,
      results.items.map((c) => {
        const row = [caseNameOf(c), statusOf(c), executorOf(c)];
        if (hasNotes) row.push(c.description ?? "—");
        return row;
      }),
    );
    sections.push(`\n**Per-Test-Case Results**\n${resultsMd}${paginationFooter(results.page_info)}`);

    // Slim each case down to the fields that matter for a results view. The raw
    // payload embeds the full nested test_case (steps, expected_results, …),
    // which balloons the response past the MCP token cap on large runs.
    const cases = results.items.map((c) => ({
      run_case_id: c.id,
      test_case_id: c.test_case?.id ?? null,
      human_id: c.test_case?.human_id ?? null,
      title: c.test_case?.title ?? null,
      status: statusOf(c),
      status_id: c.status_id ?? null,
      assignee: executorOf(c),
      ...(c.description ? { description: c.description } : {}),
    }));

    return hybrid(
      {
        test_run: { id: run.id, human_id: run.human_id, title: run.title, status: run.status },
        result_summary: summary,
        test_run_cases: cases,
        page_info: results.page_info,
      },
      sections.join("\n"),
    );
  };
}
