import deploymentManifest from "@/contracts/deployments/arbitrum-sepolia.json";
import type { Address } from "viem";

export const TABY_CHAIN_ID = 421614;
export const TABY_USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
export const TABY_DEFAULT_CAP_BASE_UNITS = BigInt(30000000);
export const TABY_DEFAULT_EXPIRY_HOURS = 48;
export const TABY_MAX_AMOUNT_BASE_UNITS = BigInt("1000000000000");

type SettlementDeploymentManifest = {
  address: string;
  chainId: number;
  contractName: string;
  contractVersion?: string;
  supportedToken: string;
};

const settlementDeployment = deploymentManifest as SettlementDeploymentManifest;

export const TABY_SETTLEMENT_CONTRACT_VERSION =
  settlementDeployment.contractVersion ?? "v1";
export const TABY_SETTLEMENT_MANIFEST_ADDRESS =
  settlementDeployment.address.toLowerCase() as Address;

export function getSettlementContractAddress() {
  assertSettlementDeploymentConfig();

  return (process.env.SETTLEMENT_CONTRACT_ADDRESS ?? settlementDeployment.address).toLowerCase();
}

export function assertSettlementDeploymentConfig() {
  if (settlementDeployment.contractName !== "TabySettlement") {
    throw new Error("Settlement manifest contract mismatch.");
  }

  if (settlementDeployment.contractVersion !== "v2") {
    throw new Error("Settlement needs an updated contract before this tab can continue.");
  }

  if (settlementDeployment.chainId !== TABY_CHAIN_ID) {
    throw new Error("Settlement manifest chain mismatch.");
  }

  if (settlementDeployment.supportedToken.toLowerCase() !== TABY_USDC_ADDRESS.toLowerCase()) {
    throw new Error("Settlement manifest token mismatch.");
  }

  const configuredAddress = process.env.SETTLEMENT_CONTRACT_ADDRESS?.toLowerCase();

  if (configuredAddress && configuredAddress !== settlementDeployment.address.toLowerCase()) {
    throw new Error("Settlement contract address does not match the deployment manifest.");
  }
}
