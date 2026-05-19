import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import { SERVER_INFO } from "./config.ts";
import { TmsClient, TmsApiError } from "./client.ts";
import { getProject, getProjectInputSchema, listProjects, listProjectsInputSchema } from "./tools/projects.ts";
import type { HybridResponse } from "./format.ts";

type ToolHandler = (client: TmsClient, args: unknown) => Promise<HybridResponse>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: ToolHandler;
}

const TOOLS: ToolDef[] = [
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
];

export function buildServer(apiKey: string): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  const client = new TmsClient(apiKey);

  for (const tool of TOOLS) {
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
