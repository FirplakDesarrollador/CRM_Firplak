"use client";

import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { useLocale, useT, useValueLabel } from "@/lib/i18n/client";
import type { OfflineAccount, OfflineOpportunity } from "@/lib/offline/types";
import { ClientLink, EmptyRow } from "./parts";

export function OpportunityList({ opportunities, accounts, showClient = true, empty }: {
  opportunities: OfflineOpportunity[];
  accounts: Map<string, OfflineAccount>;
  showClient?: boolean;
  empty: string;
}) {
  const t = useT();
  const label = useValueLabel();
  const locale = useLocale();
  const today = todayISO();
  return (
    <ul className="divide-y divide-[var(--border)]">
      {opportunities.length === 0 && <EmptyRow>{empty}</EmptyRow>}
      {opportunities.map((o) => {
        const account = o.account_id ? accounts.get(o.account_id) : undefined;
        const late = o.close_date !== null && o.close_date < today;
        return (
          <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{o.name}</p>
              {showClient && account && (
                <p className="mt-0.5 text-xs"><ClientLink id={account.id} name={account.name} known /></p>
              )}
              {o.next_step && <p className="mt-1 line-clamp-2 text-xs text-muted">{t("Siguiente paso")}: {o.next_step}</p>}
            </div>
            <div className="flex flex-none flex-col items-end gap-1 text-right">
              {o.amount !== null && <span className="num font-semibold">{formatCurrency(o.amount, o.currency ?? "COP")}</span>}
              {o.stage && (
                <span className="badge">
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: o.stage_color ?? "var(--muted)" }} aria-hidden="true" />
                  {label(o.stage)}
                </span>
              )}
              {o.close_date && (
                <span className={`text-xs ${late ? "font-semibold text-danger" : "text-muted"}`}>{t("Cierre")}: {formatDate(o.close_date, locale)}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OfflineOpportunities({ opportunities, accounts }: { opportunities: OfflineOpportunity[]; accounts: Map<string, OfflineAccount> }) {
  const t = useT();
  return (
    <section className="card">
      <OpportunityList opportunities={opportunities} accounts={accounts} empty={t("No tienes oportunidades abiertas.")} />
    </section>
  );
}
