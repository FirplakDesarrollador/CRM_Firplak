"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { AmountInput, formatAmountValue } from "@/components/ui/AmountInput";
import { formatCurrency } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { newId } from "@/lib/offline/outbox";
import { defaultBook, marketCurrency, priceFor, priceIndex, type PriceIndex } from "@/lib/offline/prices";
import { lineTotal, quoteTotals } from "@/lib/offline/quotes";
import { addOutbox, requestSend, updateOutbox } from "@/lib/offline/store";
import type { OfflineAccount, OfflineBook, OfflineProduct, OfflineSnapshot, OutboxItem, OutboxLine } from "@/lib/offline/types";
import { parseAmount } from "@/lib/records/form";
import { Actions, Field, invalid, read, Rejection, savedNotice, serverErrors, Shell, type Errors } from "./OfflineForms";
import { QuoteTotalsBox, SourceBadge } from "./OfflineQuote";
import { matches, SearchBox } from "./parts";
import { closeForm, go } from "./route";

// Cotizar sin señal. El precio de cada producto lo pone el teléfono con la regla del CRM (la lista del cliente y,
// si el producto no está en ella, la de su canal) sobre lo descargado. Lo cotizado se respeta: si al enviar el
// precio de lista ya es otro, el CRM guarda el que vio el cliente y deja la línea marcada.

const FIELDS = ["name", "account_id", "opportunity_id", "contact_id", "description"];
/** El mismo tope que acepta el servidor. */
const MAX_LINES = 200;
/** Productos que muestra el buscador a la vez: en un teléfono, más es desplazarse de más. */
const SHOWN = 8;

type Price = { unit_price: number | null; source: OutboxLine["source"]; book: string | null };

/** Una línea mientras se edita: cantidad, descuento y precio manual son el texto de los campos. */
type Draft = {
  product_id: string;
  name: string;
  code: string | null;
  unit: string | null;
  quantity: string;
  discount: string;
  manual: string;
  /** Precio con que ya estaba cotizada (al corregir): se conserva mientras no cambie el cliente. */
  kept: (Price & { unit_price: number }) | null;
};

const fromLine = (line: OutboxLine): Draft => ({
  product_id: line.product_id,
  name: line.name,
  code: line.code,
  unit: line.unit,
  quantity: formatAmountValue(line.quantity),
  discount: line.discount ? formatAmountValue(line.discount) : "",
  manual: line.source === "manual" ? formatAmountValue(line.unit_price) : "",
  kept: { unit_price: line.unit_price, source: line.source, book: line.book },
});

/** El precio de una línea: el ya cotizado, el de la lista que le aplica al cliente o el que escriba la persona. */
function priceOf(draft: Draft, account: OfflineAccount | undefined, sameClient: boolean, books: OfflineBook[], index: PriceIndex): Price {
  const kept = sameClient ? draft.kept : null;
  if (kept && kept.source !== "manual") return kept;
  const found = account && !kept ? priceFor(account, draft.product_id, books, index) : null;
  if (found) return { unit_price: found.unit_price, source: found.source, book: found.book.name };
  return { unit_price: parseAmount(draft.manual), source: "manual", book: null };
}

const quantityOf = (draft: Draft) => parseAmount(draft.quantity);
const discountOf = (draft: Draft) => (draft.discount ? parseAmount(draft.discount) : 0);
const validQuantity = (n: number | null): n is number => n !== null && n > 0;
const validDiscount = (n: number | null): n is number => n !== null && n >= 0 && n <= 100;

/** Campo numérico que arranca con el texto de la línea y después avisa lo que se escribe. */
function Amount({ text, ...props }: { text: string } & Omit<React.ComponentProps<typeof AmountInput>, "defaultValue">) {
  const [seed] = useState(text);
  return <AmountInput defaultValue={seed} {...props} />;
}

function LineRow({ draft, price, currency, errors, unavailable, onChange, onRemove }: {
  draft: Draft;
  price: Price;
  currency: string;
  errors: Errors;
  /** El CRM avisó que este producto ya no se vende. */
  unavailable: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const id = draft.product_id;
  const quantity = quantityOf(draft);
  const discount = discountOf(draft);
  const total = price.unit_price !== null && validQuantity(quantity) && validDiscount(discount)
    ? lineTotal({ quantity, unit_price: price.unit_price, discount })
    : null;
  const problems = [errors[`q:${id}`], errors[`p:${id}`], errors[`d:${id}`]];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold [overflow-wrap:anywhere]">{draft.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{[draft.code, draft.unit].filter(Boolean).join(" · ")}</span>
            <SourceBadge source={price.source} />
            {unavailable && <span className="badge badge-danger">{t("Ya no está disponible")}</span>}
          </p>
        </div>
        <button type="button" className="btn btn-icon flex-none" onClick={onRemove} aria-label={`${t("Quitar")}: ${draft.name}`}><Trash2 size={15} /></button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={`sq-qty-${id}`}>{t("Cantidad")}</label>
          <Amount id={`sq-qty-${id}`} text={draft.quantity} className="input num" onValueChange={(text) => onChange({ quantity: text })} {...invalid(`sq-qty-${id}`, errors[`q:${id}`])} />
        </div>
        <div>
          <label className="label" htmlFor={`sq-disc-${id}`}>{t("Desc. %")}</label>
          <Amount id={`sq-disc-${id}`} text={draft.discount} placeholder="0" className="input num" onValueChange={(text) => onChange({ discount: text })} {...invalid(`sq-disc-${id}`, errors[`d:${id}`])} />
        </div>
        <div>
          {price.source === "manual" ? (
            <>
              <label className="label" htmlFor={`sq-price-${id}`}>{t("Precio unit.")}</label>
              <Amount id={`sq-price-${id}`} text={draft.manual} className="input num" onValueChange={(text) => onChange({ manual: text })} {...invalid(`sq-price-${id}`, errors[`p:${id}`])} />
            </>
          ) : (
            <>
              <p className="label">{t("Precio unit.")}</p>
              <p className="num flex h-[2.4rem] items-center text-sm">{formatCurrency(price.unit_price, currency)}</p>
            </>
          )}
        </div>
        <div className="text-right">
          <p className="label">{t("Total")}</p>
          <p className="num flex h-[2.4rem] items-center justify-end font-semibold">{total === null ? "—" : formatCurrency(total, currency)}</p>
        </div>
      </div>
      {price.source === "manual" && !errors[`p:${id}`] && (
        <p className="help">{t("No está en la lista del cliente ni en la de su canal: escribe el precio.")}</p>
      )}
      {(["q", "p", "d"] as const).map((key, i) => problems[i] && (
        <p key={key} id={`sq-${key === "q" ? "qty" : key === "p" ? "price" : "disc"}-${id}-error`} className="error-text">{t(problems[i])}</p>
      ))}
    </li>
  );
}

function Picker({ products, account, books, index, currency, added, full, onAdd }: {
  products: OfflineProduct[];
  account: OfflineAccount | undefined;
  books: OfflineBook[];
  index: PriceIndex;
  currency: string;
  /** Productos que ya están en la cotización: uno por línea. */
  added: Set<string>;
  full: boolean;
  onAdd: (product: OfflineProduct) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const found = useMemo(() => products.filter((p) => matches(query, p.name, p.product_code, p.family)), [products, query]);
  if (!account) return <p className="text-sm text-muted">{t("Elige el cliente para ver los productos con sus precios.")}</p>;
  if (full) return <p className="text-sm text-muted">{t("La cotización ya tiene el máximo de productos.")}</p>;
  const shown = found.slice(0, SHOWN);
  return (
    <>
      <SearchBox id="sq-buscar" label={t("Buscar producto por nombre o referencia")} value={query} onChange={setQuery} />
      <ul className="mt-1 divide-y divide-[var(--border)]">
        {found.length === 0 && <li className="py-6 text-center text-sm text-muted">{t("Ningún producto coincide con la búsqueda.")}</li>}
        {shown.map((p) => {
          const price = priceFor(account, p.id, books, index);
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">{p.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span>{[p.product_code, p.family].filter(Boolean).join(" · ")}</span>
                  {price?.source === "canal" && <SourceBadge source="canal" />}
                </p>
              </div>
              <div className="flex flex-none flex-col items-end gap-1">
                {price
                  ? <span className="num text-sm font-semibold">{formatCurrency(price.unit_price, currency)}</span>
                  : <span className="text-xs text-muted">{t("Sin precio de lista")}</span>}
                {added.has(p.id)
                  ? <span className="badge badge-success">{t("Agregado")}</span>
                  : <button type="button" className="btn btn-sm" onClick={() => onAdd(p)} aria-label={`${t("Agregar")}: ${p.name}`}><Plus size={13} aria-hidden="true" /> {t("Agregar")}</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {found.length > shown.length && (
        <p className="help">{t("Mostrando")} {shown.length} {t("de")} {found.length}. {t("Escribe para buscar.")}</p>
      )}
    </>
  );
}

/** Dónde poner el cursor según el primer error. */
function focusError(errors: Errors) {
  const key = Object.keys(errors)[0];
  if (!key) return;
  const [kind, product] = key.split(":");
  const id = product
    ? `sq-${kind === "q" ? "qty" : kind === "p" ? "price" : "disc"}-${product}`
    : key === "account_id" ? "sq-account" : key === "name" ? "sq-name" : "sq-buscar";
  document.getElementById(id)?.focus();
}

export function OfflineQuoteForm({ userId, snapshot, outbox, editing, client }: {
  userId: string;
  /** Lo descargado, con los clientes creados sin señal. */
  snapshot: OfflineSnapshot;
  outbox: OutboxItem[];
  editing: OutboxItem | null;
  /** Cliente desde cuya ficha (o lista de precios) se abrió el formulario. */
  client: string | null;
}) {
  const t = useT();
  const rejected = serverErrors(editing, FIELDS);
  const [errors, setErrors] = useState<Errors>(rejected.fields);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const original = editing?.values.account_id ?? null;
  const [accountId, setAccountId] = useState(() => {
    const wanted = original ?? client ?? "";
    return snapshot.accounts.some((a) => a.id === wanted) ? wanted : "";
  });
  const [drafts, setDrafts] = useState<Draft[]>(() => (editing?.lines ?? []).map(fromLine));
  const v = (name: string) => editing?.values[name] ?? "";

  const books = snapshot.price_books;
  const index = useMemo(() => priceIndex(snapshot.prices), [snapshot.prices]);
  const account = snapshot.accounts.find((a) => a.id === accountId);
  const currency = marketCurrency(account?.market);
  const book = account ? defaultBook(account, books) : null;
  const sameClient = Boolean(original) && accountId === original;
  const unsentClients = new Set(outbox.filter((item) => item.kind === "account" && item.status !== "sent").map((item) => item.id));
  // El CRM no acepta una cotización con una oportunidad en otra moneda: solo se ofrecen las que sirven.
  const opportunities = snapshot.opportunities.filter((o) => o.account_id === accountId && (!o.currency || o.currency === currency));
  const contacts = snapshot.contacts.filter((c) => c.account_id === accountId);
  const unavailable = new Set((editing?.status === "rejected" ? editing.errors ?? [] : []).filter((e) => e.field.startsWith("line:")).map((e) => e.field.slice(5)));

  const prices = drafts.map((draft) => priceOf(draft, account, sameClient, books, index));
  const totals = quoteTotals(
    drafts.flatMap((draft, i) => {
      const quantity = quantityOf(draft);
      const discount = discountOf(draft);
      const unit_price = prices[i].unit_price;
      return unit_price !== null && validQuantity(quantity) && validDiscount(discount) ? [{ quantity, unit_price, discount }] : [];
    }),
    currency,
  );

  const clear = (...keys: string[]) => setErrors((current) => (keys.some((key) => current[key]) ? Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))) : current));
  const add = (p: OfflineProduct) => {
    setDrafts((list) => (list.length >= MAX_LINES || list.some((d) => d.product_id === p.id)
      ? list
      : [...list, { product_id: p.id, name: p.name, code: p.product_code, unit: p.unit, quantity: "1", discount: "", manual: "", kept: null }]));
    clear("lines");
  };
  const change = (id: string, patch: Partial<Draft>) => {
    setDrafts((list) => list.map((d) => (d.product_id === id ? { ...d, ...patch } : d)));
    clear(`q:${id}`, `p:${id}`, `d:${id}`);
  };
  const remove = (id: string) => {
    setDrafts((list) => list.filter((d) => d.product_id !== id));
    clear(`q:${id}`, `p:${id}`, `d:${id}`);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const values = read(e.currentTarget);
    const next: Errors = {};
    if (!account) next.account_id = "Elige un cliente";
    else if (!book) next.account_id = "Este cliente no tiene una lista de precios que le aplique";
    if (!values.name) next.name = "Escribe un nombre para la cotización";
    if (drafts.length === 0) next.lines = "Agrega al menos un producto";
    const lines: OutboxLine[] = [];
    drafts.forEach((draft, i) => {
      const id = draft.product_id;
      const quantity = quantityOf(draft);
      const discount = discountOf(draft);
      const { unit_price, source, book: from } = prices[i];
      if (!validQuantity(quantity)) next[`q:${id}`] = "La cantidad debe ser mayor que cero";
      if (unit_price === null) next[`p:${id}`] = "Escribe el precio";
      if (!validDiscount(discount)) next[`d:${id}`] = "El descuento va de 0 a 100";
      if (validQuantity(quantity) && unit_price !== null && validDiscount(discount)) {
        lines.push({ product_id: id, name: draft.name, code: draft.code, unit: draft.unit, quantity, unit_price, discount, source, book: from });
      }
    });
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusError(next);
      return;
    }
    const dependsOn = unsentClients.has(accountId) ? accountId : null;
    const id = editing?.id ?? newId();
    setSaving(true);
    setFailed(false);
    try {
      if (editing) {
        await updateOutbox(id, { values, title: values.name, currency, lines, status: "pending", reason: null, errors: undefined, duplicates: undefined, dependsOn });
      } else {
        await addOutbox({ id, userId, kind: "quote", title: values.name, values, currency, lines, createdAt: Date.now(), status: "pending", reason: null, sentAt: null, attempts: 0, dependsOn });
      }
      requestSend();
      savedNotice(t);
      // Una cotización nueva se queda a la vista, con su número provisional; al corregir se vuelve a donde se estaba.
      if (editing) closeForm();
      else go({ f: null, e: null, q: id });
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Shell
      bare
      title={t(editing ? "Editar cotización" : "Nueva cotización")}
      help={t("Se arma con los precios descargados y queda en este dispositivo. Al volver la señal se envía al CRM, que respeta lo que cotizaste.")}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Rejection item={editing} others={rejected.others} />
        {failed && <Alert tone="error">{t("No se pudo guardar en este dispositivo. Revisa que el navegador tenga espacio y vuelve a intentar.")}</Alert>}

        <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field id="sq-account" label={t("Cliente")} error={errors.account_id} required className="sm:col-span-2">
            <select
              id="sq-account"
              name="account_id"
              className="select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                clear("account_id");
              }}
              {...invalid("sq-account", errors.account_id)}
            >
              <option value="">{t("Elige un cliente")}</option>
              {snapshot.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{unsentClients.has(a.id) ? ` · ${t("sin enviar")}` : ""}</option>
              ))}
            </select>
            {account && book && <p className="help">{t("Lista de precios")}: {book.name} · {book.currency}</p>}
          </Field>
          {account && !book && (
            <div className="sm:col-span-2">
              <Alert tone="warning">{t("Este cliente no tiene una lista de precios que le aplique y el CRM no acepta cotizarle así. Pide que le asignen una lista o revisa su canal y su mercado.")}</Alert>
            </div>
          )}
          <Field id="sq-name" label={t("Nombre de la cotización")} error={errors.name} required className="sm:col-span-2">
            <input id="sq-name" name="name" className="input" maxLength={200} defaultValue={v("name")} placeholder={t("Ej.: Muebles de baño, torre 2")} onChange={() => clear("name")} {...invalid("sq-name", errors.name)} />
          </Field>
          <Field id="sq-opportunity" label={t("Oportunidad")} error={errors.opportunity_id}>
            <select key={accountId} id="sq-opportunity" name="opportunity_id" className="select" defaultValue={sameClient ? v("opportunity_id") : ""} {...invalid("sq-opportunity", errors.opportunity_id)}>
              <option value="">{t("Crear una nueva con este nombre")}</option>
              {opportunities.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          {contacts.length > 0 && (
            <Field id="sq-contact" label={t("Contacto")} error={errors.contact_id}>
              <select key={accountId} id="sq-contact" name="contact_id" className="select" defaultValue={sameClient ? v("contact_id") : ""} {...invalid("sq-contact", errors.contact_id)}>
                <option value="">{t("Sin contacto")}</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </Field>
          )}
        </section>

        {/* «Enter» en el buscador o en una cantidad no guarda la cotización a medias. */}
        <section className="card" onKeyDown={(e) => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault(); }}>
          <div className="card-header">
            <h3 className="card-title">{t("Productos")} <span className="badge num">{drafts.length}</span></h3>
          </div>
          {drafts.length > 0 && (
            <ul className="divide-y divide-[var(--border)] border-b border-line">
              {drafts.map((draft, i) => (
                <LineRow
                  key={draft.product_id}
                  draft={draft}
                  price={prices[i]}
                  currency={currency}
                  errors={errors}
                  unavailable={unavailable.has(draft.product_id)}
                  onChange={(patch) => change(draft.product_id, patch)}
                  onRemove={() => remove(draft.product_id)}
                />
              ))}
            </ul>
          )}
          <div className="p-4">
            {errors.lines && <p className="error-text mb-2 mt-0" role="alert">{t(errors.lines)}</p>}
            <Picker
              products={snapshot.products}
              account={account}
              books={books}
              index={index}
              currency={currency}
              added={new Set(drafts.map((d) => d.product_id))}
              full={drafts.length >= MAX_LINES}
              onAdd={add}
            />
          </div>
        </section>

        <QuoteTotalsBox totals={totals} currency={currency} />

        <section className="card space-y-3 p-4">
          <Field id="sq-description" label={t("Observaciones")} error={errors.description}>
            <textarea id="sq-description" name="description" className="textarea" rows={3} maxLength={2000} defaultValue={v("description")} />
          </Field>
          <Actions saving={saving} label={t(editing ? "Guardar cambios" : "Guardar cotización")} />
        </section>
      </form>
    </Shell>
  );
}
