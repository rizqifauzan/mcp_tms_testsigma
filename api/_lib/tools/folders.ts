import { z } from "zod";
import type { TmsClient } from "../client.js";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.js";

interface Folder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  project_id?: string;
  order?: number;
  children?: Folder[];
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
  const res = await client.getList<Folder>(
    `/projects/${encodeURIComponent(args.project_id)}/folders`,
    { page_size: args.page_size, cursor: args.cursor },
  );

  const md = mdTable(
    ["Name", "Folder ID", "Parent"],
    res.items.map((f) => [f.name, f.id, f.parent_folder_id ?? "(root)"]),
  ) + paginationFooter(res.page_info);

  return hybrid({ folders: res.items, page_info: res.page_info }, md);
}
