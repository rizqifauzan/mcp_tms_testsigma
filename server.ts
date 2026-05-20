import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./api/_lib/server.js";
import { AuthError, extractApiKey } from "./api/_lib/auth.js";

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: "testsigma-tms-mcp",
        status: "ok",
        transport: "streamable-http",
        hint: "POST MCP JSON-RPC requests here with X-Testsigma-Key header.",
      }),
    );
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let apiKey: string;
  try {
    apiKey = extractApiKey(req.headers);
  } catch (err) {
    if (err instanceof AuthError) {
      res.writeHead(err.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    throw err;
  }

  const body = await readJsonBody(req);

  const mcp = buildServer(apiKey);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    void transport.close();
    void mcp.close();
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }));
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("unhandled request error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
});

export default server;
