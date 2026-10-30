import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

const STYLES = {
  info: { cls: "bg-info-soft text-info", Icon: Info },
  success: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-soft text-warning", Icon: AlertTriangle },
  error: { cls: "bg-danger-soft text-danger", Icon: XCircle },
};

export function Alert({ tone = "info", children }: { tone?: keyof typeof STYLES; children: React.ReactNode }) {
  const { cls, Icon } = STYLES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${cls}`}>
      <Icon size={16} className="mt-0.5 flex-none" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
