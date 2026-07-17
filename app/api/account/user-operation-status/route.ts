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
    const receipt = await resolveUserOperationReceipt(
      record.userOperationHash,
    );

    if (receipt?.transactionHash && receipt.success) {
      const confirmed = await upsertUserOperationRecord({
        ...(payload as Parameters<typeof upsertUserOperationRecord>[0]),
        didToken,
        status: "confirmed",
        transactionHash: receipt.transactionHash,
        userOperationHash: record.userOperationHash,
      });

      if ("record" in confirmed) {
        return Response.json({ record: confirmed.record });
      }
    }

    if (receipt?.transactionHash && !receipt.success) {
      const failed = await upsertUserOperationRecord({
        ...(payload as Parameters<typeof upsertUserOperationRecord>[0]),
        didToken,
        failureCode: "batch_reverted",
        failureMessage: failedOperationMessage(record.purpose),
        status: "failed",
        transactionHash: receipt.transactionHash,
        userOperationHash: record.userOperationHash,
      });

      if ("record" in failed) {
        return Response.json({ record: failed.record });
      }
    }
  }

  return Response.json({ record });
}

function failedOperationMessage(purpose: string) {
  switch (purpose) {
    case "final_tab_registration":
      return "Locking did not go through. Nothing changed. Try again.";
    case "final_tab_revocation":
      return "Revocation did not go through. Nothing changed. Try again.";
    case "final_tab_cancellation":
      return "We could not cancel this Final Tab. Try again before creating a fresh one.";
    case "final_tab_settlement":
      return "Settlement did not go through. Nothing moved.";
    case "settlement_withdrawal":
      return "Withdrawal did not go through. Nothing moved.";
    case "final_tab_authorization":
    default:
      return "Approval did not go through. Nothing changed. Try again.";
  }
}

async function resolveUserOperationReceipt(userOperationHash: string) {
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

    if (payload && typeof payload === "object" && "result" in payload) {
      const result = payload.result;

      if (!result || typeof result !== "object") {
        return null;
      }

      const success = "success" in result ? result.success !== false : true;
      const receipt = "receipt" in result ? result.receipt : null;

      if (
        receipt &&
        typeof receipt === "object" &&
        "transactionHash" in receipt &&
        typeof receipt.transactionHash === "string"
      ) {
        return { success, transactionHash: receipt.transactionHash };
      }
    }
  } catch {
    return null;
  }

  return null;
}
