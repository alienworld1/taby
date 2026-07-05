import { authProofFromRequest, parseJson, resultResponse } from "@/lib/tabs/http";
import { createTab, getCurrentUserTabs } from "@/lib/tabs/server";

export async function GET(request: Request) {
  const didToken = authProofFromRequest(request);
  return resultResponse(await getCurrentUserTabs({ didToken }));
}

export async function POST(request: Request) {
  const payload = await parseJson(request);

  if (!payload) {
    return Response.json({ code: "validation_failed" }, { status: 400 });
  }

  const didToken = authProofFromRequest(request, payload);
  return resultResponse(
    await createTab({ ...(payload as Parameters<typeof createTab>[0]), didToken }),
  );
}
