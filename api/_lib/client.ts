import { TMS_BASE_URL } from "./config.js";

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
   * `data.<resource_plural>` key (e.g. `data.projects`). A few endpoints
   * (`/users`) return `data` as a direct array — we handle both shapes.
   */
  async getList<T>(path: string, query?: Query): Promise<ListResult<T>> {
    const env = await this.request<{ data: unknown; page_info?: PageInfo }>("GET", path, { query });
    const items = (Array.isArray(env.data) ? env.data : takeOnlyValue(env.data as Record<string, unknown>)) as T[];
    const page_info: PageInfo = env.page_info ?? {
      page_size: items.length,
      total_count: items.length,
      next: null,
      prev: null,
    };
    return { items, page_info };
  }

  /**
   * GET a detail endpoint. The TMS envelope wraps the object under a single
   * `data.<resource_singular>` key (e.g. `data.project`).
   */
  async getOne<T>(path: string): Promise<T> {
    const env = await this.request<EnvelopeOne>("GET", path);
    return takeOnlyValue(env.data) as T;
  }

  /**
   * POST a body and unwrap the single-key envelope. Used for create + reparent.
   */
  async postOne<T>(path: string, body: unknown): Promise<T> {
    const env = await this.request<EnvelopeOne>("POST", path, { body });
    return takeOnlyValue(env.data) as T;
  }

  /**
   * PUT a body and unwrap the single-key envelope. Used for update.
   */
  async putOne<T>(path: string, body: unknown): Promise<T> {
    const env = await this.request<EnvelopeOne>("PUT", path, { body });
    return takeOnlyValue(env.data) as T;
  }

  /**
   * DELETE. Many delete endpoints return an empty body or just `{ message }`.
   * We don't unwrap — caller usually doesn't need the response.
   */
  async delete(path: string): Promise<void> {
    await this.request<unknown>("DELETE", path);
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts?: { query?: Query; body?: unknown },
  ): Promise<T> {
    const url = buildUrl(path, opts?.query);
    const hasBody = opts?.body !== undefined;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(opts!.body) } : {}),
    };

    const res = await fetch(url, init);
    const requestId = res.headers.get("x-tms-api-request-id");
    const ctype = res.headers.get("content-type") ?? "";
    let body: unknown = undefined;
    if (ctype.includes("application/json")) {
      const text = await res.text();
      body = text.length > 0 ? JSON.parse(text) : undefined;
    } else {
      const text = await res.text();
      body = text.length > 0 ? text : undefined;
    }

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
