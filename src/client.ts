import { TMS_BASE_URL } from "./config.ts";

export class TmsApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly body: unknown;
  constructor(message: string, status: number, requestId: string | null, body: unknown) {
    super(message);
    this.name = "TmsApiError";
    this.status = status;
    this.requestId = requestId;
    this.body = body;
  }
}

export interface PageInfo {
  page_size: number;
  total_count: number;
  next: string | null;
  prev: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  page_info: PageInfo;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(TMS_BASE_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export class TmsClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async get<T>(path: string, query?: Query): Promise<T> {
    const url = buildUrl(path, query);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    const requestId = res.headers.get("x-tms-api-request-id");
    const ctype = res.headers.get("content-type") ?? "";
    const body = ctype.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = extractErrorMessage(body) ?? `TMS API ${res.status}`;
      throw new TmsApiError(msg, res.status, requestId, body);
    }
    return body as T;
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.error === "string") return b.error;
  return null;
}
