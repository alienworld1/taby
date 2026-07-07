import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { previewSettlementProposal } from "@/lib/tabs/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
  const payload = await parseJson(request);
  const { proposalId } = await context.params;
  const didToken = authProofFromRequest(request, payload);

  return resultResponse(
    await previewSettlementProposal({
      didToken,
      expectedProposalHash: payload?.expectedProposalHash,
      expectedSnapshotHash: payload?.expectedSnapshotHash,
      phase: payload?.phase,
      proposalId,
    }),
  );
}
