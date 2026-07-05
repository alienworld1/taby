import type { TabResult } from "@/lib/tabs/types";

export async function parseJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function authProofFromRequest(request: Request, payload?: Record<string, unknown> | null) {
  const header = request.headers.get("authorization");

  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  return payload?.didToken;
}

export function resultResponse<T>(result: TabResult<T>) {
  if (!result.ok) {
    return Response.json(
      { code: result.code, details: result.details },
      { status: result.status },
    );
  }

  return Response.json(result.data);
}
