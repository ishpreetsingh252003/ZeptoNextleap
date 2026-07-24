import {
  documentEvidenceExtractionSchema,
  publicDocumentSchema,
  type Evidence,
  type PublicDocument
} from "@zepto/research-contracts";
import {
  documentEvidenceExtractionPrompt,
  jsonSchemaFor
} from "@zepto/research-prompts";
import type { AiProvider } from "./ai/types.js";

function documentKey(documentId: string, sourceType: string): string {
  return JSON.stringify([documentId, sourceType]);
}

export async function extractEvidence(
  documents: readonly PublicDocument[],
  provider: AiProvider
): Promise<Evidence[]> {
  const parsedDocuments = publicDocumentSchema.array().parse(documents);
  if (parsedDocuments.length === 0) return [];

  const documentsByKey = new Map(
    parsedDocuments.map((document) => [
      documentKey(document.externalId, document.sourceType),
      document
    ])
  );
  const promptInput = {
    documents: parsedDocuments.map((document) => ({
      documentId: document.externalId,
      sourceType: document.sourceType,
      text: document.normalizedText
    }))
  };

  const result = await provider.generateStructured({
    stage: documentEvidenceExtractionPrompt.stage,
    promptVersion: documentEvidenceExtractionPrompt.version,
    schemaName: documentEvidenceExtractionPrompt.name,
    systemPrompt: documentEvidenceExtractionPrompt.system,
    userPrompt: `${JSON.stringify(promptInput)}\n\nReturn only the requested structured object.`,
    jsonSchema: jsonSchemaFor(documentEvidenceExtractionPrompt),
    validate: (value) => {
      const output = documentEvidenceExtractionSchema.parse(value);
      for (const evidence of output.evidence) {
        const document = documentsByKey.get(documentKey(evidence.documentId, evidence.sourceType));
        if (!document) throw new Error("Evidence referenced an unknown document.");
        if (!document.normalizedText.includes(evidence.supportingQuote)) {
          throw new Error("Supporting quote was not found in the originating document.");
        }
      }
      return output;
    }
  });

  return result.data.evidence;
}
