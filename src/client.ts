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

export interface ListResult<T> {
  items: T[];
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

interface EnvelopeList {
  message?: string;
  data: Record<string, unknown[]>;
  page_info: PageInfo;
}

interface EnvelopeOne {
  message?: string;
  data: Record<string, unknown>;
}

export class TmsClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * GET a list endpoint. The TMS envelope wraps the array under a single
   * `data.<resource_plural>` key (e.g. `data.projects`). This unwraps it.
   */
  async getList<T>(path: string, query?: Query): Promise<ListResult<T>> {
    const env = await this.request<EnvelopeList>(path, query);
    const items = takeOnlyValue(env.data) as T[];
    return { items, page_info: env.page_info };
  }

  /**
   * GET a detail endpoint. The TMS envelope wraps the object under a single
   * `data.<resource_singular>` key (e.g. `data.project`).
   */
  async getOne<T>(path: string): Promise<T> {
    const env = await this.request<EnvelopeOne>(path);
    return takeOnlyValue(env.data) as T;
  }

  private async request<T>(path: string, query?: Query): Promise<T> {
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

function takeOnlyValue(obj: Record<string, unknown>): unknown {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    throw new Error("TMS response data envelope was empty");
  }
  if (keys.length > 1) {
    throw new Error(`TMS response data envelope had multiple keys: ${keys.join(", ")}`);
  }
  return obj[keys[0]!];
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.error === "string") return b.error;
  return null;
}
