import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { recordSettlementTransaction } from "@/lib/tabs/server";

export async function POST(request: Request) {
  const payload = await parseJson(request);

  if (!payload) {
    return Response.json({ code: "validation_failed" }, { status: 400 });
  }

  const didToken = authProofFromRequest(request, payload);

  return resultResponse(
    await recordSettlementTransaction({
      ...(payload as Parameters<typeof recordSettlementTransaction>[0]),
      didToken,
    }),
  );
}
