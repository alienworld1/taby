import {
  getSettlementAccountReadiness,
  persistSettlementAccountReadiness,
} from "@/lib/account/server";
import { assertZeroDevServerConfig } from "@/lib/account/zerodev/config";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

export async function GET(request: Request) {
  const didToken = getBearerToken(request);
  const result = await getSettlementAccountReadiness({ didToken });

  if (!("readiness" in result)) {
    return Response.json({ code: result.code }, { status: result.status });
  }

  try {
    return Response.json({
      config: assertZeroDevServerConfig(),
      readiness: result.readiness,
    });
  } catch {
    return Response.json({ code: "zerodev_config_mismatch" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ code: "login_invalid" }, { status: 400 });
  }

  const result = await persistSettlementAccountReadiness(
    payload as Parameters<typeof persistSettlementAccountReadiness>[0],
  );

  if (!("readiness" in result)) {
    return Response.json({ code: result.code }, { status: result.status });
  }

  return Response.json({ readiness: result.readiness });
}
