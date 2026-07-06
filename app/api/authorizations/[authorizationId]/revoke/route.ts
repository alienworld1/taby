import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { revokeTabAuthorization } from "@/lib/tabs/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ authorizationId: string }> },
) {
  const payload = await parseJson(request);

  if (!payload) {
    return Response.json({ code: "validation_failed" }, { status: 400 });
  }

  const { authorizationId } = await context.params;
  const didToken = authProofFromRequest(request, payload);

  return resultResponse(
    await revokeTabAuthorization({
      ...(payload as Omit<Parameters<typeof revokeTabAuthorization>[0], "authorizationId">),
      authorizationId,
      didToken,
    }),
  );
}
