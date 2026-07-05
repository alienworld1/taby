export const TABY_CHAIN_ID = 421614;
export const TABY_USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
export const TABY_DEFAULT_CAP_BASE_UNITS = BigInt(30000000);
export const TABY_DEFAULT_EXPIRY_HOURS = 48;
export const TABY_MAX_AMOUNT_BASE_UNITS = BigInt("1000000000000");

export function getSettlementContractAddress() {
  return process.env.SETTLEMENT_CONTRACT_ADDRESS ?? null;
}
