import { NextRequest } from "next/server";
import { runPipeline, type PipelineEvent } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const config = await request.json().catch(() => null) as {
    objective: string;
    company: string;
    country: string;
    dateRange: string;
    minRating: number;
    maxReviews: number;
    sources: string[];
    dateFrom: string | null;
    dateTo: string | null;
  } | null;

  if (!config || !Array.isArray(config.sources)) {
    return Response.json({ error: "Invalid discovery configuration." }, { status: 400 });
  }

  const normalized = {
    ...config,
    dateFrom: typeof config.dateFrom === "string" && config.dateFrom ? config.dateFrom : null,
    dateTo: typeof config.dateTo === "string" && config.dateTo ? config.dateTo : null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const result = await runPipeline(normalized, send);
        send({ type: "complete", payload: result });
      } catch (cause) {
        send({ type: "error", message: cause instanceof Error ? cause.message : "Discovery failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
