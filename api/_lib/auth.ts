import type { IncomingHttpHeaders } from "node:http";

const HEADER_NAME = "x-testsigma-key";

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function extractApiKey(headers: IncomingHttpHeaders): string {
  const raw = headers[HEADER_NAME];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0) {
    throw new AuthError(
      "Missing X-Testsigma-Key header. Configure your Testsigma TMS API key in the MCP client.",
    );
  }
  return value.trim();
}
