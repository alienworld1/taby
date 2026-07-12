import { getSettlementFunding } from "@/lib/account/withdrawals";

function bearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

export async function GET(request: Request) {
  const result = await getSettlementFunding(bearer(request));
  if (!result.ok) return Response.json({ code: result.code }, { status: result.status });
  return Response.json({ funding: result.funding });
}
