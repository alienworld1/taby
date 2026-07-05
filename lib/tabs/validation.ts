import { TABY_MAX_AMOUNT_BASE_UNITS } from "@/lib/tabs/constants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const EVM_TX_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const INTEGER_PATTERN = /^\d+$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && EVM_ADDRESS_PATTERN.test(value);
}

export function normalizeEvmAddress(value: unknown) {
  return isEvmAddress(value) ? value.toLowerCase() : null;
}

export function isEvmTxHash(value: unknown): value is string {
  return typeof value === "string" && EVM_TX_PATTERN.test(value);
}

export function normalizeText(
  value: unknown,
  options: { max: number; min?: number; nullable?: boolean },
) {
  if (typeof value !== "string") {
    return options.nullable ? null : undefined;
  }

  const trimmed = value.trim();

  if (options.nullable && trimmed.length === 0) {
    return null;
  }

  if (trimmed.length < (options.min ?? 0) || trimmed.length > options.max) {
    return undefined;
  }

  return trimmed;
}

export function parseBaseUnits(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return null;
    }

    return BigInt(value);
  }

  if (typeof value !== "string" || !INTEGER_PATTERN.test(value)) {
    return null;
  }

  const amount = BigInt(value);

  if (amount <= BigInt(0) || amount > TABY_MAX_AMOUNT_BASE_UNITS) {
    return null;
  }

  return amount;
}

export function parseOptionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isSafeInteger(value) || typeof value !== "number" || value <= 0) {
    return undefined;
  }

  return value;
}

export function parseFutureDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return null;
  }

  return date;
}
