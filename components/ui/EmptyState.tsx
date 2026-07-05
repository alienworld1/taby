import type { ReactNode } from "react";
import { FiCircle } from "react-icons/fi";
import { Card } from "@/components/ui/Card";

type EmptyStateProps = {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
};

export function EmptyState({
  action,
  description,
  icon = <FiCircle aria-hidden="true" />,
  title,
}: EmptyStateProps) {
  return (
    <Card className="grid place-items-center px-6 py-10 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
        {icon}
      </div>
      <h2 className="text-2xl font-semibold leading-8">{title}</h2>
      <p className="mt-2 max-w-sm text-base leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Card>
  );
}
