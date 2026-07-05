import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { disputeExpense } from "@/lib/tabs/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ expenseId: string }> },
) {
  const payload = await parseJson(request);

  if (!payload) {
    return Response.json({ code: "validation_failed" }, { status: 400 });
  }

  const { expenseId } = await context.params;
  const didToken = authProofFromRequest(request, payload);

  return resultResponse(await disputeExpense({ ...payload, didToken, expenseId }));
}
