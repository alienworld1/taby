import { upsertUserOperationRecord } from "@/lib/account/server";
import { getServerZeroDevRpcUrl } from "@/lib/account/zerodev/config";
import { authProofFromRequest } from "@/lib/tabs/http";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ code: "login_invalid" }, { status: 400 });
  }

  const didToken = authProofFromRequest(
    request,
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null,
  );
  const result = await upsertUserOperationRecord({
    ...(payload as Parameters<typeof upsertUserOperationRecord>[0]),
    didToken,
  });

  if (!("record" in result)) {
    return Response.json({ code: result.code }, { status: result.status });
  }

  const record = result.record;

  if (!record) {
    return Response.json({ code: "account_unavailable" }, { status: 503 });
  }

  if (record.status === "submitted" && !record.transactionHash) {
    const transactionHash = await resolveUserOperationTransactionHash(
      record.userOperationHash,
    );

    if (transactionHash) {
      const confirmed = await upsertUserOperationRecord({
        ...(payload as Parameters<typeof upsertUserOperationRecord>[0]),
        didToken,
        status: "confirmed",
        transactionHash,
        userOperationHash: record.userOperationHash,
      });

      if ("record" in confirmed) {
        return Response.json({ record: confirmed.record });
      }
    }
  }

  return Response.json({ record });
}

async function resolveUserOperationTransactionHash(userOperationHash: string) {
  const zeroDevRpcUrl = getServerZeroDevRpcUrl();

  if (!zeroDevRpcUrl) {
    return null;
  }

  try {
    const response = await fetch(zeroDevRpcUrl, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getUserOperationReceipt",
        params: [userOperationHash],
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as unknown;

    if (
      payload &&
      typeof payload === "object" &&
      "result" in payload &&
      payload.result &&
      typeof payload.result === "object" &&
      "receipt" in payload.result &&
      payload.result.receipt &&
      typeof payload.result.receipt === "object" &&
      "transactionHash" in payload.result.receipt &&
      typeof payload.result.receipt.transactionHash === "string"
    ) {
      return payload.result.receipt.transactionHash;
    }
  } catch {
    return null;
  }

  return null;
}
