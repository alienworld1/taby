import "server-only";
import { createRequire } from "node:module";
import { isRemoteSignerConfigured } from "@/lib/account/zerodev/remoteSigner";
import { getZeroDevAccountConfig } from "@/lib/account/zerodev/config";

type DelegatedAuthorizationFeatureGate = {
  enabled: boolean;
  reason:
    | "feature_disabled"
    | "start_gate_evidence_missing"
    | "permissions_package_unavailable"
    | "custody_unavailable"
    | "paymaster_proof_missing"
    | "account_configuration_mismatch"
    | "ready";
};

const requireFromProject = createRequire(`${process.cwd()}/package.json`);

function installedPermissionsPackageVersion() {
  try {
    const packageMetadata = requireFromProject("@zerodev/permissions/package.json") as {
      version?: unknown;
    };

    return typeof packageMetadata.version === "string" ? packageMetadata.version : null;
  } catch {
    return null;
  }
}

/**
 * This is intentionally server-only and fail-closed. The delegated path must
 * remain unavailable until the pinned permission package, custody adapter, and
 * live negative-test evidence are all present for the current deployment.
 */
export function getDelegatedAuthorizationFeatureGate(): DelegatedAuthorizationFeatureGate {
  if (process.env.TABY_DELEGATED_AUTHORIZATION_ENABLED !== "true") {
    return { enabled: false, reason: "feature_disabled" };
  }

  if (process.env.TABY_DELEGATED_AUTHORIZATION_START_GATE_EVIDENCE !== "verified") {
    return { enabled: false, reason: "start_gate_evidence_missing" };
  }

  const installedVersion = installedPermissionsPackageVersion();
  if (
    !installedVersion ||
    process.env.TABY_DELEGATED_AUTHORIZATION_PERMISSION_PACKAGE_VERSION !== installedVersion
  ) {
    return { enabled: false, reason: "permissions_package_unavailable" };
  }

  if (
    process.env.TABY_DELEGATED_AUTHORIZATION_CUSTODY_MODE !== "remote_signer" ||
    process.env.TABY_DELEGATED_AUTHORIZATION_REMOTE_SIGNER_READY !== "true" ||
    !isRemoteSignerConfigured()
  ) {
    return { enabled: false, reason: "custody_unavailable" };
  }

  if (process.env.TABY_DELEGATED_AUTHORIZATION_PAYMASTER_PROVEN !== "true") {
    return { enabled: false, reason: "paymaster_proof_missing" };
  }

  const config = getZeroDevAccountConfig();
  if (
    process.env.TABY_DELEGATED_AUTHORIZATION_CONFIG_HASH !== config.configHash ||
    process.env.TABY_DELEGATED_AUTHORIZATION_KERNEL_VERSION !== config.kernelVersion ||
    process.env.TABY_DELEGATED_AUTHORIZATION_ENTRY_POINT_VERSION !== config.entryPointVersion
  ) {
    return { enabled: false, reason: "account_configuration_mismatch" };
  }

  return { enabled: true, reason: "ready" };
}
