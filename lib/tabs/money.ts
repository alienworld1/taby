const USDC_DECIMALS = 6;
const USDC_FACTOR = BigInt(10 ** USDC_DECIMALS);
const USDC_INPUT_PATTERN = /^(?:\d+|\d*\.\d{1,6})$/;

export function parseUsdcToBaseUnits(value: string) {
  const trimmed = value.trim();

  if (!USDC_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const [wholePart, fractionalPart = ""] = trimmed.split(".");
  const whole = BigInt(wholePart || "0");
  const fractional = BigInt(fractionalPart.padEnd(USDC_DECIMALS, "0"));
  const amount = whole * USDC_FACTOR + fractional;

  return amount > BigInt(0) ? amount : null;
}

export function parseUsdcShareToBaseUnits(value: string) {
  const trimmed = value.trim();

  if (!USDC_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const [wholePart, fractionalPart = ""] = trimmed.split(".");
  return (
    BigInt(wholePart || "0") * USDC_FACTOR +
    BigInt(fractionalPart.padEnd(USDC_DECIMALS, "0"))
  );
}

export function formatUsdc(baseUnits: string | bigint) {
  const value = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits);
  const whole = value / USDC_FACTOR;
  const fractional = (value % USDC_FACTOR).toString().padStart(USDC_DECIMALS, "0");
  const trimmedFractional = fractional.replace(/0+$/, "").padEnd(2, "0");

  return `${whole.toString()}.${trimmedFractional} USDC`;
}

export function formatSignedUsdc(baseUnits: bigint) {
  if (baseUnits < BigInt(0)) {
    return `Over by ${formatUsdc(-baseUnits)}`;
  }

  return `Remaining: ${formatUsdc(baseUnits)}`;
}

export function equalSplitShares(amountBaseUnits: bigint, memberIds: string[]) {
  const sortedIds = [...memberIds].sort();
  const baseShare = amountBaseUnits / BigInt(sortedIds.length);
  let remainder = amountBaseUnits % BigInt(sortedIds.length);
  const shares = new Map<string, bigint>();

  for (const memberId of sortedIds) {
    const extra = remainder > BigInt(0) ? BigInt(1) : BigInt(0);
    remainder -= extra;
    shares.set(memberId, baseShare + extra);
  }

  return shares;
}
