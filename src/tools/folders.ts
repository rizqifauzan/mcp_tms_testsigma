import { z } from "zod";
import type { TmsClient, PaginatedResponse } from "../client.ts";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.ts";

interface Folder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  project_id?: string;
  [k: string]: unknown;
}

export const listFoldersInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListFoldersArgs = z.object(listFoldersInputSchema);

export async function listFolders(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListFoldersArgs.parse(rawArgs);
  const res = await client.get<PaginatedResponse<Folder>>(
    `/projects/${encodeURIComponent(args.project_id)}/folders`,
    { page_size: args.page_size, cursor: args.cursor },
  );

  const md = mdTable(
    ["Name", "Folder ID", "Parent"],
    res.data.map((f) => [f.name, f.id, f.parent_folder_id ?? "(root)"]),
  ) + paginationFooter(res.page_info);

  return hybrid(res, md);
}
