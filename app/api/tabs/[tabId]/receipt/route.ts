import { authProofFromRequest, resultResponse } from "@/lib/tabs/http";
import { getFinalTabReceipt } from "@/lib/tabs/server";

export async function GET(request: Request, context: { params: Promise<{ tabId: string }> }) {
  const { tabId } = await context.params;
  const didToken = authProofFromRequest(request);

  return resultResponse(await getFinalTabReceipt({ didToken, tabId }));
}
