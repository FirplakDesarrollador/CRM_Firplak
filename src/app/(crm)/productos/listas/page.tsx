import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { savePriceBook } from "@/lib/records/phase2-actions";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Listas de precios" };

export default async function PriceBooksPage() {
  const user = await requireUser();
  const canEdit = can(user.access, "products", "edit");
  const supabase = await createClient();
  const [{ data: books }, { data: entries }] = await Promise.all([
    supabase.from("price_books").select("*").order("is_standard", { ascending: false }).order("name"),
    supabase.from("price_book_entries").select("price_book_id"),
  ]);
  const count = (id: string) => (entries ?? []).filter((e) => e.price_book_id === id).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/productos" className="inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink"><ChevronLeft size={16} /> <Tr>Productos</Tr></Link>
      <div className="flex items-center gap-3">
        <ObjectIcon object="products" />
        <div>
          <p className="eyebrow"><Tr>Catálogo</Tr></p>
          <h1 className="text-xl font-medium"><Tr>Listas de precios</Tr></h1>
        </div>
      </div>
      <p className="text-sm text-muted"><Tr>Cada cotización usa una lista (por defecto, la de su oportunidad o la estándar). Los precios por producto se editan en la ficha del producto.</Tr></p>
      {canEdit && (
        <section className="glass">
          <div className="card-header"><h2 className="card-title"><Tr>Nueva lista</Tr></h2></div>
          <ActionForm action={savePriceBook.bind(null, null)} resetOnSuccess className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-48 flex-1"><label className="label" htmlFor="pb-name"><Tr>Nombre</Tr></label><input id="pb-name" name="name" className="input" required /></div>
            <div className="min-w-48 flex-1"><label className="label" htmlFor="pb-desc"><Tr>Descripción</Tr></label><input id="pb-desc" name="description" className="input" /></div>
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
                  <label className="label" htmlFor={`n-${b.id}`}>Lista · {count(b.id)} productos</label>
                  <input id={`n-${b.id}`} name="name" className="input font-medium" defaultValue={b.name} disabled={!canEdit} />
                </div>
                <div className="min-w-48 flex-1">
                  <label className="label" htmlFor={`d-${b.id}`}><Tr>Descripción</Tr></label>
                  <input id={`d-${b.id}`} name="description" className="input" defaultValue={b.description ?? ""} disabled={!canEdit} />
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
