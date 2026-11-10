"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { formatCurrency } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { bookPrice, defaultBook, priceFor, priceIndex, type PriceResult } from "@/lib/offline/prices";
import type { OfflineSnapshot } from "@/lib/offline/types";
import { EmptyRow, matches, SearchBox } from "./parts";
import { go } from "./route";

const LIMIT = 60;

/** Catálogo con el precio que le corresponde a un cliente (o el de una lista), calculado en el dispositivo. */
export function OfflineProducts({ snapshot, selection }: { snapshot: OfflineSnapshot; selection: string | null }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const index = useMemo(() => priceIndex(snapshot.prices), [snapshot.prices]);
  const lists = snapshot.price_books.filter((b) => !b.is_client_list);

  const account = selection?.startsWith("a:") ? snapshot.accounts.find((a) => a.id === selection.slice(2)) : undefined;
  const list = selection?.startsWith("l:") ? lists.find((b) => b.id === selection.slice(2)) : undefined;
  const book = account ? defaultBook(account, snapshot.price_books) : list ?? null;
  const chosen = account ? `a:${account.id}` : list ? `l:${list.id}` : "";
  const price = (productId: string): PriceResult | null =>
    account ? priceFor(account, productId, snapshot.price_books, index) : list ? bookPrice(list, productId, index) : null;

  const found = snapshot.products.filter((p) => matches(query, p.name, p.product_code, p.family));
  const shown = found.slice(0, LIMIT);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="precios-para" className="label">{t("Precios para")}</label>
          <select id="precios-para" className="select" value={chosen} onChange={(e) => go({ p: e.target.value || null })}>
            <option value="">{t("Elige un cliente o una lista")}</option>
            {snapshot.accounts.length > 0 && (
              <optgroup label={t("Mis clientes")}>
                {snapshot.accounts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
              </optgroup>
            )}
            {lists.length > 0 && (
              <optgroup label={t("Listas de precios")}>
                {lists.map((b) => <option key={b.id} value={`l:${b.id}`}>{b.name} · {b.currency}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="sm:self-end">
          <SearchBox id="buscar-producto" label={t("Buscar producto por nombre o referencia")} value={query} onChange={setQuery} />
        </div>
      </div>

      {account && !book && <Alert tone="warning">{t("Este cliente no tiene una lista de precios que le aplique. Elige una lista para ver precios.")}</Alert>}
      {book && (
        <p className="text-sm text-muted" role="status">
          {t("Lista de precios")}: <span className="font-semibold text-ink">{book.name}</span> · {book.currency}
          {account && book.is_client_list ? ` · ${t("propia del cliente")}` : ""}
        </p>
      )}

      <section className="card">
        <ul className="divide-y divide-[var(--border)]">
          {snapshot.products.length === 0 && <EmptyRow>{t("No hay productos activos.")}</EmptyRow>}
          {snapshot.products.length > 0 && found.length === 0 && <EmptyRow>{t("Ningún producto coincide con la búsqueda.")}</EmptyRow>}
          {shown.map((p) => {
            const result = price(p.id);
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{[p.product_code, p.family].filter(Boolean).join(" · ")}</p>
                </div>
                {book && (
                  <div className="flex flex-none flex-col items-end gap-1 text-right">
                    {result ? (
                      <>
                        <span className="num font-semibold">{formatCurrency(result.unit_price, result.currency)}</span>
                        {result.source === "canal" && <span className="badge badge-info">{t("Precio de canal")}</span>}
                      </>
                    ) : (
                      <span className="text-xs text-muted">{t("Sin precio en esta lista")}</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {found.length > shown.length && (
          <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">
            {t("Mostrando")} {shown.length} {t("de")} {found.length}. {t("Escribe para buscar.")}
          </p>
        )}
      </section>
    </>
  );
}
