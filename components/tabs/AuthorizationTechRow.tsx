type AuthorizationTechRowProps = {
  label: string;
  value: string;
};

export function AuthorizationTechRow({ label, value }: AuthorizationTechRowProps) {
  return (
    <div className="grid gap-1">
      <span className="font-sans text-xs font-semibold text-muted">{label}</span>
      <span className="break-all font-mono text-foreground">{value}</span>
    </div>
  );
}
