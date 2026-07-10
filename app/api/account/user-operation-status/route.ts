import { upsertUserOperationRecord } from "@/lib/account/server";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ code: "login_invalid" }, { status: 400 });
  }

  const result = await upsertUserOperationRecord(
    payload as Parameters<typeof upsertUserOperationRecord>[0],
  );

  if (!("record" in result)) {
    return Response.json({ code: result.code }, { status: result.status });
  }

  return Response.json({ record: result.record });
}
