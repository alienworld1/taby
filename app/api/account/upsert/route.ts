import { upsertAccount } from "@/lib/account/server";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ code: "login_invalid" }, { status: 400 });
  }

  const result = await upsertAccount(payload as Parameters<typeof upsertAccount>[0]);

  if (!result.ok) {
    return Response.json({ code: result.code }, { status: result.status });
  }

  return Response.json({ account: result.account });
}
