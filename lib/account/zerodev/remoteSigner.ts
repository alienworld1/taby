import "server-only";

import { normalizeEvmAddress } from "@/lib/tabs/validation";

export type RemoteSignerCredential = {
  address: string;
  reference: string;
};

/**
 * Server-only boundary for ZeroDev Remote Signer. This module intentionally
 * returns opaque references and public addresses only; private key material is
 * never accepted, returned, logged, or persisted by Taby.
 */
export interface RemoteSignerAdapter {
  createPermissionSigner(): Promise<RemoteSignerCredential>;
  disablePermissionSigner(reference: string): Promise<void>;
  getPermissionSigner(reference: string): Promise<RemoteSignerCredential>;
}

function configuredRemoteSignerUrl() {
  const url = process.env.ZERODEV_REMOTE_SIGNER_URL;
  return url && /^https:\/\//.test(url) ? url : null;
}

function configuredApiKey() {
  return process.env.ZERODEV_REMOTE_SIGNER_API_KEY || null;
}

async function requestRemoteSigner(path: string, init: RequestInit) {
  const baseUrl = configuredRemoteSignerUrl();
  const apiKey = configuredApiKey();
  if (!baseUrl || !apiKey) throw new Error("remote_signer_unavailable");

  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers },
  });

  if (!response.ok) throw new Error("remote_signer_unavailable");
  return (await response.json()) as unknown;
}

function credentialFromResponse(value: unknown): RemoteSignerCredential {
  if (!value || typeof value !== "object") throw new Error("remote_signer_invalid_response");
  const record = value as Record<string, unknown>;
  const address = normalizeEvmAddress(record.address);
  const reference = typeof record.reference === "string" ? record.reference : null;
  if (!address || !reference || reference.length > 512) throw new Error("remote_signer_invalid_response");
  return { address, reference };
}

export const zeroDevRemoteSignerAdapter: RemoteSignerAdapter = {
  async createPermissionSigner() {
    return credentialFromResponse(await requestRemoteSigner("/keys", { method: "POST" }));
  },
  async disablePermissionSigner(reference) {
    if (!reference || reference.length > 512) throw new Error("remote_signer_invalid_reference");
    await requestRemoteSigner(`/keys/${encodeURIComponent(reference)}`, { method: "DELETE" });
  },
  async getPermissionSigner(reference) {
    if (!reference || reference.length > 512) throw new Error("remote_signer_invalid_reference");
    return credentialFromResponse(
      await requestRemoteSigner(`/keys/${encodeURIComponent(reference)}`, { method: "GET" }),
    );
  },
};

export function isRemoteSignerConfigured() {
  return Boolean(configuredRemoteSignerUrl() && configuredApiKey());
}
