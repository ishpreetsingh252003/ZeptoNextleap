import type {
  ProvenanceLevel,
  PublicDocument
} from "@zepto/research-contracts";

function hasHttpSource(document: PublicDocument): boolean {
  try {
    return ["http:", "https:"].includes(
      new URL(document.canonicalUrl).protocol
    ) && document.sourceMetadata?.sourceUrlAvailable !== false;
  } catch {
    return false;
  }
}

export function classifyProvenance(
  document: PublicDocument
): ProvenanceLevel {
  const metadata = document.sourceMetadata;
  if (document.sourceType === "user_interview") {
    if (
      metadata?.consentStatus !== "consent_given"
      || !metadata.interviewDate
      || !metadata.provenanceNote
      || !document.externalId
      || !document.capturedAt
    ) {
      return "INSUFFICIENT";
    }
    return "VERIFIED";
  }

  if (!hasHttpSource(document) || !document.externalId || !document.sourceName) {
    return "INSUFFICIENT";
  }
  if (
    document.publicationDate
    && document.capturedAt
    && metadata?.provenanceNote
  ) {
    return "VERIFIED";
  }
  return "PARTIAL";
}

export function withProvenanceLevel(
  document: PublicDocument
): PublicDocument {
  return {
    ...document,
    sourceMetadata: {
      ...document.sourceMetadata,
      provenanceLevel: classifyProvenance(document)
    }
  };
}
