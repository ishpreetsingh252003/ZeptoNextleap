import { NextRequest, NextResponse } from "next/server";
import { stat, readFile } from "fs/promises";
import { relative, resolve, sep } from "path";
import { repoRootOrThrow } from "@/lib/repo-paths";

const ALLOWED_PREFIXES = [
  "research/discovery-output",
  "research/opportunity-output",
  "apps/research-web/data/runs",
];

export async function GET(request: NextRequest) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path) {
    return NextResponse.json({ error: "Missing path parameter." }, { status: 400 });
  }
  // repoRootOrThrow() never throws: it resolves the repo root when available
  // and otherwise falls back to the writable runtime workspace.
  const root = repoRootOrThrow();
  const candidate = resolve(root, path);
  const repoRelative = relative(root, candidate).replaceAll(sep, "/");
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => repoRelative === prefix || repoRelative.startsWith(`${prefix}/`)
  );
  if (!allowed) {
    return NextResponse.json({ error: "Path is outside the generated output directories." }, { status: 403 });
  }
  try {
    const info = await stat(candidate);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Path does not point to a file." }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Output file does not exist." }, { status: 404 });
  }
  const data = await readFile(candidate);
  const fileName = repoRelative.split("/").pop() ?? "output";
  return new NextResponse(data, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}
