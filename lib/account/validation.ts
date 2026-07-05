const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value);
}

export function isValidEvmAddress(value: string) {
  return EVM_ADDRESS_PATTERN.test(value);
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && isValidEmail(trimmed) ? trimmed : null;
}

export function normalizeDisplayName(value: unknown, email: string | null) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().slice(0, 40);
  }

  if (email) {
    const [name] = email.split("@");
    const cleaned = name.replace(/[._-]+/g, " ").trim();

    if (cleaned.length >= 2) {
      return cleaned.slice(0, 40);
    }
  }

  return "Taby member";
}

export function validateDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length < 2 || trimmed.length > 40) {
    return null;
  }

  return trimmed;
}
