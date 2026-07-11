"use client";

import { useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import { Button } from "@/components/ui/Button";

type ReceiptCopyButtonProps = {
  label: string;
  value: string | null;
};

export function ReceiptCopyButton({ label, value }: ReceiptCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    if (!value || copied || copying) {
      return;
    }

    setCopying(true);
    setFailed(false);

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 1800);
    } finally {
      setCopying(false);
    }
  }

  return (
    <Button
      aria-label={`Copy ${label}`}
      disabled={!value || copied || copying}
      icon={copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
      loading={copying}
      onClick={handleCopy}
      size="sm"
      variant="secondary"
    >
      {copied ? "Copied" : failed ? "Try again" : "Copy"}
    </Button>
  );
}
