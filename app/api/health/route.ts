import { getDelegatedAuthorizationFeatureGate } from "@/lib/tabs/delegatedAuthorizationFeature";

export async function GET() {
  const delegatedAuthorization = getDelegatedAuthorizationFeatureGate();

  return Response.json({
    delegatedAuthorizationReady: delegatedAuthorization.enabled,
    ok: true,
    service: "taby",
  });
}
