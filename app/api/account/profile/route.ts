import { updateDisplayName } from "@/lib/account/server";

export async function PATCH(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ code: "account_unavailable" }, { status: 400 });
  }

  const result = await updateDisplayName(payload as Parameters<typeof updateDisplayName>[0]);

  if (!result.ok) {
    return Response.json({ code: result.code }, { status: result.status });
  }

  return Response.json({ account: result.account });
}
