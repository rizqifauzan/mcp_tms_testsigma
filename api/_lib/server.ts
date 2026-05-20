import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import { SERVER_INFO } from "./config.js";
import { TmsClient, TmsApiError } from "./client.js";
import { getProject, getProjectInputSchema, listProjects, listProjectsInputSchema } from "./tools/projects.js";
import { listFolders, listFoldersInputSchema } from "./tools/folders.js";
import {
  getTestCase,
  getTestCaseInputSchema,
  listTestCases,
  listTestCasesInputSchema,
} from "./tools/test_cases.js";
import {
  getTestPlan,
  getTestPlanInputSchema,
  listTestPlans,
  listTestPlansInputSchema,
} from "./tools/test_plans.js";
import {
  getTestRun,
  getTestRunInputSchema,
  listTestRuns,
  listTestRunsInputSchema,
} from "./tools/test_runs.js";
import { listLabelOptionsInputSchema, makeListLabelOptions } from "./tools/lookups.js";
import {
  bulkUpdateTestCasesInputSchema,
  createTestCaseInputSchema,
  deleteTestCase,
  deleteTestCaseInputSchema,
  makeBulkUpdateTestCases,
  makeCreateTestCase,
  makeUpdateTestCase,
  updateTestCaseInputSchema,
} from "./tools/test_cases_write.js";
import {
  createFolder,
  createFolderInputSchema,
  deleteFolder,
  deleteFolderInputSchema,
  moveFolder,
  moveFolderInputSchema,
  updateFolder,
  updateFolderInputSchema,
} from "./tools/folders_write.js";
import type { HybridResponse } from "./format.js";

type ToolHandler = (client: TmsClient, args: unknown) => Promise<HybridResponse>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: ToolHandler;
}

function buildTools(apiKey: string): ToolDef[] {
  return [
    {
      name: "list_projects",
      title: "List Testsigma projects",
      description:
        "List all projects visible to the authenticated user in Testsigma TMS. Returns a paginated table with project name, human-readable ID prefix (e.g. GR for GROW), and UUID. Use this first to discover project IDs needed by other tools.",
      inputSchema: listProjectsInputSchema,
      handler: listProjects,
    },
    {
      name: "get_project",
      title: "Get project details",
      description:
        "Fetch full details of a single Testsigma project by UUID, including description and metadata.",
      inputSchema: getProjectInputSchema,
      handler: getProject,
    },
    {
      name: "list_folders",
      title: "List folders in a project",
      description:
        "List all folders in a Testsigma project. Each folder has a parent_folder_id (null for root folders). Build the tree client-side to render the hierarchy. Returns folder name, UUID, and parent UUID.",
      inputSchema: listFoldersInputSchema,
      handler: listFolders,
    },
    {
      name: "list_test_cases",
      title: "List test cases",
      description:
        "List test cases in a project. Optionally filter by folder_id or substring-match the name via search. Returns human ID (e.g. GR-7), name, template type (TCD or STEPS), and UUID.",
      inputSchema: listTestCasesInputSchema,
      handler: listTestCases,
    },
    {
      name: "get_test_case",
      title: "Get test case details",
      description:
        "Fetch full test case details including preconditions, steps, and expected results. Accepts both UUID and human ID (e.g. GR-7). For TCD-template test cases, steps and expected_results are returned as newline-delimited text blobs. For STEPS-template, individual_steps[] is a structured array.",
      inputSchema: getTestCaseInputSchema,
      handler: getTestCase,
    },
    {
      name: "list_test_plans",
      title: "List test plans",
      description:
        "List all test plans in a project. A test plan is a logical grouping of test cases that can be executed as test runs.",
      inputSchema: listTestPlansInputSchema,
      handler: listTestPlans,
    },
    {
      name: "get_test_plan",
      title: "Get test plan details",
      description: "Fetch detailed information about a single test plan by UUID or human ID.",
      inputSchema: getTestPlanInputSchema,
      handler: getTestPlan,
    },
    {
      name: "list_test_runs",
      title: "List test runs",
      description:
        "List test runs in a project, optionally scoped to a specific test plan. Each test run is an execution instance with its own status. Use list_label_options(kinds=['test_run_statuses']) to translate status_id values.",
      inputSchema: listTestRunsInputSchema,
      handler: listTestRuns,
    },
    {
      name: "get_test_run",
      title: "Get test run details",
      description:
        "Fetch detailed information about a single test run including its result summary (counts per status).",
      inputSchema: getTestRunInputSchema,
      handler: getTestRun,
    },
    {
      name: "list_label_options",
      title: "List lookup tables for status/priority/type",
      description:
        "Fetch reference data tables: test_case_statuses, test_case_priorities, test_case_types, test_case_automation_types, test_run_statuses. Use this to translate UUID IDs into human-readable names when displaying or filtering. Results are cached for 5 minutes per key.",
      inputSchema: listLabelOptionsInputSchema,
      handler: makeListLabelOptions(apiKey),
    },
    {
      name: "create_test_case",
      title: "Create a test case",
      description:
        "Create a new test case in a project folder. The TCD template (default, used by GROW) treats steps/expected_results as newline-delimited text blobs. STEPS template requires individual_steps[]. Status/priority/type/owner/labels accept either UUIDs OR human-readable names (resolved against lookup tables).",
      inputSchema: createTestCaseInputSchema,
      handler: makeCreateTestCase(apiKey),
    },
    {
      name: "update_test_case",
      title: "Update a test case",
      description:
        "Partially update fields of a test case identified by UUID or human ID (e.g. GR-7). Only the fields you supply will change. Status/priority/type/owner/labels accept names or UUIDs. Other fields are unchanged. Reads the current TC first to preserve fields you don't touch.",
      inputSchema: updateTestCaseInputSchema,
      handler: makeUpdateTestCase(apiKey),
    },
    {
      name: "delete_test_case",
      title: "Delete a test case",
      description:
        "Permanently delete a test case. Destructive — Claude Code will prompt the user for permission before invoking. Accepts UUID or human ID.",
      inputSchema: deleteTestCaseInputSchema,
      handler: deleteTestCase,
    },
    {
      name: "bulk_update_test_cases",
      title: "Bulk update multiple test cases",
      description:
        "Apply the same field changes to multiple test cases in one call (e.g. reassign owner across many TCs, bulk re-label). Sequential to stay under TMS rate limit (~10 req/sec). Returns per-TC success/failure summary.",
      inputSchema: bulkUpdateTestCasesInputSchema,
      handler: makeBulkUpdateTestCases(apiKey),
    },
    {
      name: "create_folder",
      title: "Create a folder",
      description:
        "Create a new folder in a project. If parent_folder_id is supplied, the new folder is reparented under it via a follow-up move call. Without parent_folder_id the folder lands at root.",
      inputSchema: createFolderInputSchema,
      handler: createFolder,
    },
    {
      name: "update_folder",
      title: "Rename or reorder a folder",
      description:
        "Update a folder's name and/or order. To change parent, use move_folder instead.",
      inputSchema: updateFolderInputSchema,
      handler: updateFolder,
    },
    {
      name: "move_folder",
      title: "Move a folder to a new parent",
      description:
        "Reparent a folder. Pass parent_folder_id to nest it, or null to move it to root.",
      inputSchema: moveFolderInputSchema,
      handler: moveFolder,
    },
    {
      name: "delete_folder",
      title: "Delete a folder",
      description:
        "Permanently delete a folder. Destructive — Claude Code will prompt the user for permission. Test cases inside the folder may also be affected (TMS behavior on deleted folders depends on server config; verify before bulk deletes).",
      inputSchema: deleteFolderInputSchema,
      handler: deleteFolder,
    },
  ];
}

export function buildServer(apiKey: string): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  const client = new TmsClient(apiKey);

  for (const tool of buildTools(apiKey)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: unknown) => {
        try {
          return await tool.handler(client, args);
        } catch (err) {
          return errorResponse(err);
        }
      },
    );
  }

  return server;
}

function errorResponse(err: unknown): HybridResponse {
  if (err instanceof TmsApiError) {
    return {
      content: [
        {
          type: "text",
          text: `Testsigma API error (HTTP ${err.status})${err.requestId ? ` [req ${err.requestId}]` : ""}: ${err.message}`,
        },
      ],
      structuredContent: { error: { status: err.status, request_id: err.requestId, message: err.message } },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    structuredContent: { error: { message } },
  };
}
