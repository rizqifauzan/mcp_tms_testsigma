// API host is `arcus.testsigma.com`, NOT the UI host `test-management.testsigma.com`.
// The UI host 301-redirects here, but cross-origin redirects drop the
// Authorization header (per fetch spec), so requests must go direct or every
// call fails with "Authorization header required". Keep this pointed at arcus.
export const TMS_BASE_URL = "https://arcus.testsigma.com/api/v1";

export const SERVER_INFO = {
  name: "testsigma-tms",
  version: "0.1.0",
} as const;

export const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
