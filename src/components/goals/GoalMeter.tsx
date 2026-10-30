import { CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { Tr } from "@/components/ui/Tr";

/** Medidor de avance: relleno navy sobre pista clara, marca del ritmo esperado y estado con ícono. */
export function GoalMeter({ actual, target, elapsed, compact = false }: { actual: number; target: number; elapsed: number; compact?: boolean }) {
  const pct = target > 0 ? actual / target : 0;
  const done = pct >= 1;
  const onPace = pct >= elapsed - 0.0001;
  const tone = done ? "var(--success)" : onPace ? "var(--brand)" : "var(--warning-mark)";
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
        <p className={`flex items-center gap-1 text-xs font-medium ${done ? "text-success" : onPace ? "text-brand" : "text-warning"}`}>
          {done ? <CheckCircle2 size={13} /> : onPace ? <TrendingUp size={13} /> : <AlertTriangle size={13} />}
          <Tr>{done ? "Meta cumplida" : onPace ? "A buen ritmo" : "Por debajo del ritmo esperado"}</Tr>
        </p>
      )}
    </div>
  );
}
