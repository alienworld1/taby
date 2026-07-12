import {
  prepareWithdrawal,
  reconcileWithdrawal,
  rejectWithdrawal,
  submitWithdrawal,
} from "@/lib/account/withdrawals";
import { authProofFromRequest, parseJson } from "@/lib/tabs/http";

export async function POST(request: Request) {
  const payload = await parseJson(request);
  if (!payload) return Response.json({ code: "validation_failed" }, { status: 400 });
  const didToken = authProofFromRequest(request, payload);
  const action = payload.action;
  const result =
    action === "prepare"
      ? await prepareWithdrawal({
          amount: payload.amount,
          didToken,
          idempotencyKey: payload.idempotencyKey,
          recipientAddress: payload.recipientAddress,
        })
      : action === "submit"
        ? await submitWithdrawal({
            didToken,
            id: payload.id,
            userOperationHash: payload.userOperationHash,
          })
        : action === "reject"
          ? await rejectWithdrawal({
              didToken,
              errorMessage: payload.errorMessage,
              id: payload.id,
            })
          : action === "reconcile"
            ? await reconcileWithdrawal({ didToken, id: payload.id })
            : { code: "validation_failed", ok: false as const, status: 422 };
  if (!result.ok) return Response.json({ code: result.code }, { status: result.status });
  return Response.json(result);
}
