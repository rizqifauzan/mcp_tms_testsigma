import { z } from "zod";
import type { TmsClient } from "../client.js";
import { hybrid, type HybridResponse } from "../format.js";

interface Folder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  project_id?: string;
  order?: number;
  [k: string]: unknown;
}

// -------- create --------

export const createFolderInputSchema = {
  project_id: z.string().min(1),
  name: z.string().min(1).describe("Folder name"),
  order: z.number().optional().describe("Sort order within the parent (default: append)"),
  parent_folder_id: z
    .string()
    .optional()
    .describe("Parent folder UUID. If set, the new folder is moved under this parent after creation."),
};

const CreateArgs = z.object(createFolderInputSchema);

export async function createFolder(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = CreateArgs.parse(rawArgs);
  const body: Record<string, unknown> = { name: args.name };
  if (args.order !== undefined) body.order = args.order;

  const created = await client.postOne<Folder>(
    `/projects/${encodeURIComponent(args.project_id)}/folders`,
    body,
  );

  // Parent assignment is a separate /move call per REFERENCE §5.
  let final: Folder = created;
  if (args.parent_folder_id) {
    final = await client.postOne<Folder>(
      `/projects/${encodeURIComponent(args.project_id)}/folders/${encodeURIComponent(created.id)}/move`,
      { parent_folder_id: args.parent_folder_id },
    );
  }

  const md = [
    `✅ Created folder **${final.name}**`,
    `UUID: \`${final.id}\` · Parent: \`${final.parent_folder_id ?? "(root)"}\``,
  ].join("\n");

  return hybrid({ folder: final }, md);
}

// -------- update --------

export const updateFolderInputSchema = {
  project_id: z.string().min(1),
  folder_id: z.string().min(1),
  name: z.string().min(1).optional().describe("New folder name"),
  order: z.number().optional().describe("New sort order within the parent"),
};

const UpdateArgs = z.object(updateFolderInputSchema);

export async function updateFolder(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = UpdateArgs.parse(rawArgs);
  if (args.name === undefined && args.order === undefined) {
    throw new Error("update_folder requires at least one of: name, order");
  }
  const body: Record<string, unknown> = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.order !== undefined) body.order = args.order;

  const updated = await client.putOne<Folder>(
    `/projects/${encodeURIComponent(args.project_id)}/folders/${encodeURIComponent(args.folder_id)}`,
    body,
  );

  return hybrid(
    { folder: updated },
    `✅ Updated folder **${updated.name}** (\`${updated.id}\`)`,
  );
}

// -------- move --------

export const moveFolderInputSchema = {
  project_id: z.string().min(1),
  folder_id: z.string().min(1).describe("Folder to move"),
  parent_folder_id: z
    .string()
    .nullable()
    .describe("New parent folder UUID, or null to move to root"),
};

const MoveArgs = z.object(moveFolderInputSchema);

export async function moveFolder(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = MoveArgs.parse(rawArgs);
  const moved = await client.postOne<Folder>(
    `/projects/${encodeURIComponent(args.project_id)}/folders/${encodeURIComponent(args.folder_id)}/move`,
    { parent_folder_id: args.parent_folder_id },
  );

  return hybrid(
    { folder: moved },
    `✅ Moved **${moved.name}** → parent \`${moved.parent_folder_id ?? "(root)"}\``,
  );
}

// -------- delete --------

export const deleteFolderInputSchema = {
  project_id: z.string().min(1),
  folder_id: z.string().min(1),
};

const DeleteArgs = z.object(deleteFolderInputSchema);

export async function deleteFolder(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = DeleteArgs.parse(rawArgs);
  await client.delete(
    `/projects/${encodeURIComponent(args.project_id)}/folders/${encodeURIComponent(args.folder_id)}`,
  );
  return hybrid(
    { deleted: true, folder_id: args.folder_id },
    `🗑️ Deleted folder \`${args.folder_id}\``,
  );
}
