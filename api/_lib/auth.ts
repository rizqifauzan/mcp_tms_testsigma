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

/**
 * Extract the TMS API key from request, trying two sources:
 *   1. URL path segment after /mcp/  → for Claude Web (no custom-header UI)
 *   2. X-Testsigma-Key header        → for Claude Code (CLI supports headers)
 *
 * The path form puts the key in the URL itself, which means anyone with
 * the URL can use it. Treat the URL like a password. Each team member
 * should use their OWN TMS API key (Settings → API Keys in TMS) so that
 * audit trail and per-user permissions are preserved.
 */
export function extractApiKey(
  pathname: string,
  headers: IncomingHttpHeaders,
): string {
  // Path: /mcp/<key>  or  /mcp/<key>/<anything>
  const m = pathname.match(/^\/mcp\/([^/]+)/);
  if (m && m[1]) {
    const key = decodeURIComponent(m[1]).trim();
    if (key.length > 0) return key;
  }

  // Fallback: header (backward-compat with Claude Code)
  const raw = headers[HEADER_NAME];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  throw new AuthError(
    "Missing TMS API key. Either embed it in the URL path (/mcp/<key>) or set the X-Testsigma-Key header.",
  );
}
