import { lookup } from "node:dns/promises";
import robotsParser from "robots-parser";
import { SourceCollectionError } from "./errors.js";

const parseRobots = robotsParser as unknown as (url: string, content: string) => { isAllowed(url: string, userAgent?: string): boolean | undefined };

function isPrivateAddress(address: string): boolean {
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:") ||
    /^127\./.test(address) || /^10\./.test(address) || /^192\.168\./.test(address) ||
    /^169\.254\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address === "0.0.0.0";
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new SourceCollectionError("INVALID_URL", "Enter a valid public URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new SourceCollectionError("UNSUPPORTED_PROTOCOL", "Only public HTTP(S) URLs are supported.");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SourceCollectionError("PRIVATE_ADDRESS_BLOCKED", "Private, local, and link-local addresses are not permitted.");
  }
  return url;
}

async function fetchWithSafeRedirects(url: URL, init: RequestInit): Promise<Response> {
  let current = url;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    await assertSafePublicUrl(current.href);
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current);
  }
  throw new SourceCollectionError("TOO_MANY_REDIRECTS", "The source exceeded the five-redirect safety limit.");
}

export async function fetchPermittedPage(rawUrl: string, userAgent: string, maxBytes: number, signal?: AbortSignal): Promise<{ url: URL; html: string }> {
  const url = await assertSafePublicUrl(rawUrl);
  const robotsUrl = new URL("/robots.txt", url.origin);
  try {
    const response = await fetchWithSafeRedirects(robotsUrl, { headers: { "user-agent": userAgent }, signal: signal ?? null });
    if (response.ok) {
      const robots = parseRobots(robotsUrl.href, await response.text());
      if (!robots.isAllowed(url.href, userAgent)) throw new SourceCollectionError("ROBOTS_DISALLOWED", "The site robots policy does not permit this collection path.");
    }
  } catch (error) {
    if (error instanceof SourceCollectionError) throw error;
  }

  const response = await fetchWithSafeRedirects(url, { headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" }, signal: signal ?? null });
  if (!response.ok) throw new SourceCollectionError(`HTTP_${response.status}`, `The public source returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new SourceCollectionError("UNSUPPORTED_CONTENT_TYPE", `Unsupported content type: ${contentType || "unknown"}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new SourceCollectionError("SOURCE_TOO_LARGE", `The source exceeds the ${maxBytes}-byte collection limit.`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new SourceCollectionError("SOURCE_TOO_LARGE", `The source exceeds the ${maxBytes}-byte collection limit.`);
  return { url: new URL(response.url), html: new TextDecoder().decode(buffer) };
}
