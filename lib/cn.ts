type ClassValue = false | null | undefined | string;

export function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}
