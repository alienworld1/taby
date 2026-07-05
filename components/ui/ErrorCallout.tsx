import type { ReactNode } from "react";
import { FiAlertCircle } from "react-icons/fi";

type ErrorCalloutProps = {
  action?: ReactNode;
  message?: string;
  title?: string;
};

export function ErrorCallout({
  action,
  message = "Something got in the way. Try again.",
  title = "Something got in the way",
}: ErrorCalloutProps) {
  return (
    <div
      aria-live="polite"
      className="rounded-md border border-error-container bg-error-container/55 p-5 text-on-error-container"
      role="alert"
    >
      <div className="flex gap-3">
        <FiAlertCircle aria-hidden="true" className="mt-1 shrink-0" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6">{message}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
