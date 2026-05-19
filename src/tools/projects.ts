import { z } from "zod";
import type { TmsClient, PaginatedResponse } from "../client.ts";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.ts";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  human_id_prefix?: string | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export const listProjectsInputSchema = {
  page_size: z.number().int().min(1).max(100).optional().describe("Items per page (default 25)"),
  cursor: z.string().optional().describe("Pagination cursor from previous response's page_info.next"),
  search: z.string().optional().describe("Filter projects by name substring"),
};

const ListProjectsArgs = z.object(listProjectsInputSchema);

export async function listProjects(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListProjectsArgs.parse(rawArgs);
  const res = await client.get<PaginatedResponse<Project>>("/projects", {
    page_size: args.page_size,
    cursor: args.cursor,
    name__CONTAINS: args.search,
  });

  const md = mdTable(
    ["ID Prefix", "Name", "ID"],
    res.data.map((p) => [p.human_id_prefix ?? "—", p.name, p.id]),
  ) + paginationFooter(res.page_info);

  return hybrid(res, md);
}

export const getProjectInputSchema = {
  project_id: z.string().min(1).describe("Project UUID (from list_projects)"),
};

const GetProjectArgs = z.object(getProjectInputSchema);

export async function getProject(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = GetProjectArgs.parse(rawArgs);
  const project = await client.get<Project>(`/projects/${encodeURIComponent(args.project_id)}`);

  const md = [
    `**${project.name}** (${project.human_id_prefix ?? "—"})`,
    `ID: \`${project.id}\``,
    project.description ? `\n${project.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return hybrid(project, md);
}
