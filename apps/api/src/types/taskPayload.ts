export interface SeoScrapePayload {
  url: string;
}

export interface ReviewScrapePayload {
  url: string;
  sources: string[];
}

export function isSeoScrapePayload(
  payload: unknown,
): payload is SeoScrapePayload {
  return (
    payload != null &&
    typeof payload === "object" &&
    "url" in payload &&
    typeof (payload as any).url === "string"
  );
}

export function isReviewScrapePayload(
  payload: unknown,
): payload is ReviewScrapePayload {
  return (
    payload != null &&
    typeof payload === "object" &&
    "url" in payload &&
    typeof (payload as any).url === "string" &&
    "sources" in payload &&
    Array.isArray((payload as any).sources) &&
    (payload as any).sources.every((source: any) => typeof source === "string")
  );
}
