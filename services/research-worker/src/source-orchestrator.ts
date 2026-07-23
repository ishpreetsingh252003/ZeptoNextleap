import {
  publicDocumentSchema,
  type AdapterContext,
  type CreateCollectionRunInput,
  type PublicDocument,
  type SourceType
} from "@zepto/research-contracts";
import type { ServerEnv } from "@zepto/shared-config";
import { getAdapter } from "./adapters/index.js";
import { SourceCollectionError } from "./adapters/errors.js";

export type SourceRequest = {
  input: CreateCollectionRunInput;
  context: AdapterContext;
};

export type SourceFailure = {
  requestIndex: number;
  sourceType: SourceType;
  code: string;
  message: string;
  retryable: boolean;
};

export type SourceOrchestrationResult = {
  documents: PublicDocument[];
  failures: SourceFailure[];
};

export class SourceOrchestrator {
  constructor(private readonly env: ServerEnv) {}

  async collect(requests: readonly SourceRequest[]): Promise<SourceOrchestrationResult> {
    const documents: PublicDocument[] = [];
    const failures: SourceFailure[] = [];

    for (const [requestIndex, request] of requests.entries()) {
      try {
        const adapter = getAdapter(request.input.sourceType, this.env);
        const collected = publicDocumentSchema.array().parse(
          await adapter.collect(request.input, request.context)
        );
        documents.push(...collected);
      } catch (error) {
        const collectionError = error instanceof SourceCollectionError ? error : null;
        failures.push({
          requestIndex,
          sourceType: request.input.sourceType,
          code: collectionError?.code ?? "SOURCE_COLLECTION_FAILED",
          message: collectionError?.message ?? "Source collection failed.",
          retryable: collectionError?.retryable ?? false
        });
      }
    }

    return { documents, failures };
  }
}
