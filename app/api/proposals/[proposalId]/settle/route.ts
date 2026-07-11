import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { orchestrateSettlement } from "@/lib/tabs/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const payload = await parseJson(request);

  if (!payload) {
    return Response.json({ code: "validation_failed" }, { status: 400 });
  }

  const { proposalId } = await params;
  const didToken = authProofFromRequest(request, payload);

  return resultResponse(
    await orchestrateSettlement({
      ...payload,
      action: payload.action,
      didToken,
      proposalId,
    }),
  );
}
