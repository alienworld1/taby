import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { acceptTabInvite } from "@/lib/tabs/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ tabId: string }> },
) {
  const payload = (await parseJson(request)) ?? {};
  const { tabId } = await context.params;
  const didToken = authProofFromRequest(request, payload);

  return resultResponse(await acceptTabInvite({ didToken, tabId }));
}
