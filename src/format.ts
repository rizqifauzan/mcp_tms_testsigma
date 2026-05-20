import type { PageInfo } from "./client.ts";

export interface HybridResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
}

export function hybrid(structured: object, markdown: string): HybridResponse {
  return {
    content: [{ type: "text", text: markdown }],
    structuredContent: structured as Record<string, unknown>,
  };
}

export function mdTable(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  if (rows.length === 0) return "_(no rows)_";
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((c) => formatCell(c)).join(" | ")} |`)
    .join("\n");
  return [headerLine, separator, body].join("\n");
}

function formatCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = String(v);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function paginationFooter(page: PageInfo): string {
  const parts = [`${page.total_count} total`, `page size ${page.page_size}`];
  if (page.next) parts.push(`next cursor: \`${truncate(page.next, 32)}\``);
  return `\n\n_${parts.join(" · ")}_`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
