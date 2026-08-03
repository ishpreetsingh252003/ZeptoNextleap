import { NextResponse } from "next/server";
import { loadResult } from "@/lib/run-history";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = loadResult(id);
  if (!result) {
    return NextResponse.json({ message: `Run ${id} was not found.` }, { status: 404 });
  }
  return NextResponse.json(result);
}
