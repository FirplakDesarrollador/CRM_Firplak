import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { savePriceBook } from "@/lib/records/phase2-actions";
import { can } from "@/lib/permissions";
import { getChannels } from "@/lib/records/data";
import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Listas de precios" };

/** Tipo de lista: de un canal, de cliente (se asigna a cuentas) o general. */
function KindSelect({ id, value, channels, disabled }: { id: string; value: string; channels: string[]; disabled: boolean }) {
  return (
    <select id={id} name="kind" className="select" defaultValue={value} disabled={disabled}>
      {channels.map((c) => <option key={c} value={`canal:${c}`}>{c}</option>)}
      <option value="cliente">Lista de cliente</option>
      <option value="general">General</option>
    </select>
  );
}

function CurrencySelect({ id, value, disabled }: { id: string; value: string; disabled: boolean }) {
  return (
    <select id={id} name="currency" className="select" defaultValue={value} disabled={disabled}>
      <option value="COP">COP</option>
      <option value="USD">USD</option>
    </select>
  );
}

export default async function PriceBooksPage() {
  const user = await requireUser();
  const canEdit = can(user.access, "products", "edit");
  const supabase = await createClient();
  const [{ data: books }, { data: entries }, { data: accounts }, channels] = await Promise.all([
    supabase.from("price_books").select("*").order("is_standard", { ascending: false }).order("name"),
    supabase.from("price_book_entries").select("price_book_id"),
    supabase.from("accounts").select("price_book_id").not("price_book_id", "is", null),
    getChannels(),
  ]);
  const count = (id: string) => (entries ?? []).filter((e) => e.price_book_id === id).length;
  const accountsOf = (id: string) => (accounts ?? []).filter((a) => a.price_book_id === id).length;
  const kindOf = (b: { channel: string | null; is_client_list: boolean }) => (b.is_client_list ? "cliente" : b.channel ? `canal:${b.channel}` : "general");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/productos" className="inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink"><ChevronLeft size={16} /> <Tr>Productos</Tr></Link>
      <div className="flex items-center gap-3">
        <ObjectIcon object="products" />
        <div>
          <h1 className="text-xl font-medium"><Tr>Listas de precios</Tr></h1>
        </div>
      </div>
      <p className="text-sm text-muted"><Tr>Cada canal tiene su lista (una por moneda). Una cotización usa la lista propia de la cuenta, si la tiene; si no, la de su canal; si no, la estándar. En una lista de cliente van solo sus productos codificados: lo demás se cotiza con la lista del canal y queda marcado «No codificado». La lista de cliente se asigna en la ficha de la cuenta. Los precios por producto se editan en la ficha del producto.</Tr></p>
      {canEdit && (
        <section className="glass">
          <div className="card-header"><h2 className="card-title"><Tr>Nueva lista</Tr></h2></div>
          <ActionForm action={savePriceBook.bind(null, null)} resetOnSuccess className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-48 flex-1"><label className="label" htmlFor="pb-name"><Tr>Nombre</Tr></label><input id="pb-name" name="name" className="input" required /></div>
            <div className="min-w-48 flex-1"><label className="label" htmlFor="pb-desc"><Tr>Descripción</Tr></label><input id="pb-desc" name="description" className="input" /></div>
            <div className="w-48"><label className="label" htmlFor="pb-kind"><Tr>Canal o tipo</Tr></label><KindSelect id="pb-kind" value={channels[0] ? `canal:${channels[0]}` : "general"} channels={channels} disabled={!canEdit} /></div>
            <div className="w-24"><label className="label" htmlFor="pb-cur"><Tr>Moneda</Tr></label><CurrencySelect id="pb-cur" value="COP" disabled={!canEdit} /></div>
            <SubmitButton pendingText="Creando…"><Tr>Crear lista</Tr></SubmitButton>
          </ActionForm>
        </section>
      )}
      <section className="card">
        <ul className="divide-y divide-[var(--border)]">
          {(books ?? []).map((b) => (
            <li key={b.id} className="px-4 py-3">
              <ActionForm action={savePriceBook.bind(null, b.id)} className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <label className="label" htmlFor={`n-${b.id}`}>Lista · {count(b.id)} productos{b.is_client_list ? ` · ${accountsOf(b.id)} ${accountsOf(b.id) === 1 ? "cuenta" : "cuentas"}` : ""}</label>
                  <input id={`n-${b.id}`} name="name" className="input font-medium" defaultValue={b.name} disabled={!canEdit} />
                </div>
                <div className="min-w-48 flex-1">
                  <label className="label" htmlFor={`d-${b.id}`}><Tr>Descripción</Tr></label>
                  <input id={`d-${b.id}`} name="description" className="input" defaultValue={b.description ?? ""} disabled={!canEdit} />
                </div>
                <div className="w-48">
                  <label className="label" htmlFor={`k-${b.id}`}><Tr>Canal o tipo</Tr></label>
                  <KindSelect id={`k-${b.id}`} value={kindOf(b)} channels={channels} disabled={!canEdit} />
                </div>
                <div className="w-24">
                  <label className="label" htmlFor={`c-${b.id}`}><Tr>Moneda</Tr></label>
                  <CurrencySelect id={`c-${b.id}`} value={b.currency} disabled={!canEdit} />
                </div>
                <label className="flex items-center gap-1.5 pb-2 text-sm font-medium">
                  <input type="checkbox" name="is_standard" defaultChecked={b.is_standard} disabled={!canEdit} className="accent-[var(--brand)]" /> <Tr>Estándar</Tr>
                </label>
                <label className="flex items-center gap-1.5 pb-2 text-sm font-medium">
                  <input type="checkbox" name="is_active" defaultChecked={b.is_active} disabled={!canEdit} className="accent-[var(--brand)]" /> <Tr>Activa</Tr>
                </label>
                {canEdit && <SubmitButton className="btn btn-sm mb-1" pendingText="…"><Tr>Guardar</Tr></SubmitButton>}
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
