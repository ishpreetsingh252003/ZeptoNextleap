import { EvidenceDetail } from "./evidence-detail";
export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EvidenceDetail evidenceId={id} />; }
