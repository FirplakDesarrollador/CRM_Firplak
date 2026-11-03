import { CheckCircle2, AlertTriangle, Clock, TrendingUp, XCircle } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { Tr } from "@/components/ui/Tr";

/** Estado de una meta. Fuera del periodo actual no aplica el ritmo: `elapsed` es 0 antes de iniciar y 1 al cerrar. */
function goalStatus(pct: number, elapsed: number) {
  if (pct >= 1) return { tone: "var(--success)", text: "text-success", Icon: CheckCircle2, label: "Meta cumplida" };
  if (elapsed >= 1) return { tone: "var(--danger)", text: "text-danger", Icon: XCircle, label: "Meta no cumplida" };
  if (elapsed <= 0) return { tone: "var(--brand)", text: "text-muted", Icon: Clock, label: "Aún no inicia" };
  if (pct >= elapsed - 0.0001) return { tone: "var(--brand)", text: "text-brand", Icon: TrendingUp, label: "A buen ritmo" };
  return { tone: "var(--warning-mark)", text: "text-warning", Icon: AlertTriangle, label: "Por debajo del ritmo esperado" };
}

/** Medidor de avance: relleno navy sobre pista clara, marca del ritmo esperado y estado con ícono. */
export function GoalMeter({ actual, target, elapsed, compact = false }: { actual: number; target: number; elapsed: number; compact?: boolean }) {
  const pct = target > 0 ? actual / target : 0;
  const { tone, text, Icon, label } = goalStatus(pct, elapsed);
  return (
    <div className={compact ? "" : "space-y-1.5"}>
      <div className="relative h-2.5 overflow-visible rounded-full bg-[color-mix(in_srgb,var(--brand)_16%,transparent)]"
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label="Cumplimiento">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, pct * 100)}%`, background: tone }} />
        {elapsed > 0 && elapsed < 1 && (
          <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink-2" style={{ left: `${elapsed * 100}%` }} title={`Ritmo esperado: ${formatPercent(elapsed * 100)}`} />
        )}
      </div>
      {!compact && (
        <p className={`flex items-center gap-1 text-xs font-medium ${text}`}>
          <Icon size={13} />
          <Tr>{label}</Tr>
        </p>
      )}
    </div>
  );
}
