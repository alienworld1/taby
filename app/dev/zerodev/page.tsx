import { notFound } from "next/navigation";
import { ZeroDevDiagnostics } from "@/components/dev/ZeroDevDiagnostics";

export default function ZeroDevDiagnosticsPage() {
  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_ZERODEV_DIAGNOSTICS === "true";

  if (!enabled) {
    notFound();
  }

  return <ZeroDevDiagnostics />;
}
