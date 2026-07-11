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

  async function handleCopy() {
    if (!value || copied) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <Button
      aria-label={`Copy ${label}`}
      disabled={!value || copied}
      icon={copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
      onClick={handleCopy}
      size="sm"
      variant="secondary"
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
