import { getVerifiedUserFromDidToken } from "@/lib/account/server";
import { getServerZeroDevRpcUrl } from "@/lib/account/zerodev/config";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

export async function POST(request: Request) {
  const didToken = getBearerToken(request);
  const verified = await getVerifiedUserFromDidToken(didToken);

  if (verified.ok !== true) {
    return Response.json({ code: verified.code }, { status: verified.status });
  }

  const zeroDevRpcUrl = getServerZeroDevRpcUrl();

  if (!zeroDevRpcUrl) {
    return Response.json({ code: "zerodev_config_mismatch" }, { status: 503 });
  }

  let body: string;

  try {
    body = await request.text();
  } catch {
    return Response.json({ code: "zerodev_config_mismatch" }, { status: 400 });
  }

  const upstream = await fetch(zeroDevRpcUrl, {
    body,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const text = await upstream.text();

  return new Response(text, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
    status: upstream.status,
  });
}
