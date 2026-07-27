import { randomUUID } from "node:crypto";
import type { PublicDocument, SourceAdapter } from "@zepto/research-contracts";
import { normalizeText } from "../lib/text.js";
import { SourceCollectionError } from "./errors.js";

export class ManualTextAdapter implements SourceAdapter {
  readonly type = "manual_text" as const;
  async collect(input: Parameters<SourceAdapter["collect"]>[0]): Promise<PublicDocument[]> {
    const text = normalizeText(input.manualText ?? "");
    if (text.length < 40) throw new SourceCollectionError("INSUFFICIENT_MANUAL_CONTEXT", "Manual text needs at least 40 characters of public-source context.");
    const id = randomUUID();
    const suppliedUrl = input.urlOrQuery && /^https?:\/\//.test(input.urlOrQuery) ? input.urlOrQuery : `manual://user-supplied-text/${id}`;
    return [{ externalId: id, url: suppliedUrl, canonicalUrl: suppliedUrl, sourceType: this.type, sourceName: "Manual import", platform: "Manual import", title: "User-supplied public source text", publicationDate: null, capturedAt: new Date().toISOString(), normalizedText: text, accessMethod: "manual_import", policyNote: "Text was supplied manually and must be reviewed for public accessibility, excerpt permission, and source traceability." }];
  }
}
