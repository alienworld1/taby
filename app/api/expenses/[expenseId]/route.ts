import { authProofFromRequest, resultResponse } from "@/lib/tabs/http";
import { removeExpense } from "@/lib/tabs/server";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ expenseId: string }> },
) {
  const { expenseId } = await context.params;
  const didToken = authProofFromRequest(request);

  return resultResponse(await removeExpense({ didToken, expenseId }));
}
