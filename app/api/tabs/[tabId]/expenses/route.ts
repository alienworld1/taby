import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { addExpense } from "@/lib/tabs/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ tabId: string }> },
) {
  const payload = await parseJson(request);

  if (!payload) {
    return Response.json({ code: "validation_failed" }, { status: 400 });
  }

  const { tabId } = await context.params;
  const didToken = authProofFromRequest(request, payload);

  return resultResponse(
    await addExpense({ ...(payload as Parameters<typeof addExpense>[0]), didToken, tabId }),
  );
}
