import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { PriceAdjustForm } from "@/components/products/PriceAdjustForm";
import { RevertAdjustment } from "@/components/products/RevertAdjustment";
import { formatNumber } from "@/lib/format";
import { selectedProducts } from "@/lib/products/selection";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ajustar precios" };

type Change = { name: string; percent: number };

/** Ajuste masivo de precios sobre los productos que muestra la lista con sus filtros. Solo administradores. */
export default async function AdjustPricesPage({ searchParams }: PageProps<"/productos/ajustar-precios">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  if (!user.access.isAdmin) redirect("/productos");
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && ["q", "f", "view"].includes(k) ? [[k, v]] : [])));
  const supabase = await createClient();
  const [{ ids, summary }, { data: books }, { data: history }] = await Promise.all([
    selectedProducts(qs, user),
    supabase.from("price_books").select("id, name, market, currency, channel, is_client_list").eq("is_active", true).order("market").order("name"),
    supabase.from("price_adjustments")
      .select("id, note, changes, rounding, product_count, price_count, created_at, reverted_at, reverted_count, filter, author:profiles!price_adjustments_created_by_fkey(full_name)")
      .order("created_at", { ascending: false }).limit(10),
  ]);
  const back = qs.size ? `/productos?${qs.toString()}` : "/productos";
  const filtered = Boolean(summary.q || summary.filters.length || summary.view);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={back} className="inline-flex items-center gap-1 text-sm font-semibold text-muted no-underline hover:text-ink">
        <ChevronLeft size={16} /> <Tr>Volver a la lista</Tr>
      </Link>
      <div>
        <h1 className="text-xl font-medium"><Tr>Ajustar precios</Tr></h1>
        <p className="max-w-[75ch] text-sm text-muted">
          <Tr>Sube o baja en un porcentaje los precios de los productos que muestra la lista, en las listas de precios que elijas. Primero ves cómo quedarían; nada cambia hasta que confirmes. Cada ajuste queda registrado y se puede deshacer.</Tr>
        </p>
      </div>
      {sp.hecho === "1" && <Alert tone="success"><Tr>Ajuste aplicado. Quedó registrado abajo, donde también se puede deshacer.</Tr></Alert>}
      <section className="card p-5">
        <p className="eyebrow"><Tr>Productos elegidos</Tr></p>
        <p className="kpi-value mt-1 text-[1.9rem]" data-testid="productos-elegidos">{formatNumber(ids.length)}</p>
        <p className="mt-1 text-sm text-muted">
          {filtered ? (
            <>
              {summary.view && <><Tr>Vista</Tr>: <strong className="text-ink">{summary.view}</strong> · </>}
              {summary.q && <><Tr>Búsqueda</Tr>: <strong className="text-ink">«{summary.q}»</strong> · </>}
              {summary.filters.length > 0 && <>{summary.filters.map((f) => `${f.field}${f.value ? ` = ${f.value}` : ""}`).join(" · ")} · </>}
              <Link href={back} className="link"><Tr>Cambiar filtros</Tr></Link>
            </>
          ) : (
            <><Tr>Sin filtros: es todo el catálogo.</Tr> <Link href="/productos" className="link"><Tr>Filtrar primero</Tr></Link></>
          )}
        </p>
      </section>
      {!filtered && <Alert tone="warning"><Tr>No hay filtros aplicados: el ajuste cambiaría los precios de todos los productos.</Tr></Alert>}
      <PriceAdjustForm qs={qs.toString()} books={(books ?? []).map((b) => ({
        id: b.id, name: b.name, currency: b.currency,
        kind: `${b.market} · ${b.is_client_list ? "Lista de cliente" : b.channel ?? "General"}`,
      }))} />

      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Ajustes anteriores</Tr></h2></div>
        {(history ?? []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted"><Tr>Todavía no se ha hecho ningún ajuste.</Tr></p> : (
          <ul className="divide-y divide-[var(--border)]">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {((h.changes ?? []) as unknown as Change[]).map((c) => `${c.name} ${c.percent > 0 ? "+" : ""}${formatNumber(c.percent)}%`).join(" · ")}
                    {h.reverted_at && <span className="badge ml-2"><Tr>Deshecho</Tr></span>}
                  </p>
                  <p className="text-xs text-muted">
                    <Fmt datetime={h.created_at} /> · {(h.author as { full_name: string | null } | null)?.full_name ?? "—"} · {formatNumber(h.product_count)} <Tr>productos</Tr> · {formatNumber(h.price_count)} <Tr>precios</Tr>
                    {Number(h.rounding) > 0 && <> · <Tr>redondeo a</Tr> {formatNumber(Number(h.rounding))}</>}
                    {h.note && <> · {h.note}</>}
                    {h.reverted_at && <> · <Tr>volvieron</Tr> {formatNumber(h.reverted_count ?? 0)} <Tr>precios</Tr></>}
                  </p>
                </div>
                {!h.reverted_at && <RevertAdjustment id={h.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
