import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { RecordLayout } from "@/components/records/RecordLayout";
import { DeleteButton } from "@/components/records/DeleteButton";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getObjectDef, getRecord, getRecordAccess } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { removeProductPrice, saveProductPrice } from "@/lib/records/phase2-actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Producto" };

export default async function ProductDetailPage({ params, searchParams }: PageProps<"/productos/[id]">) {
  const [, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("products");
  const row = await getRecord(def, id);
  if (!row) notFound();
  const supabase = await createClient();
  const [access, { data: books }, { data: entries }, { data: cases }] = await Promise.all([
    getRecordAccess("products", null),
    supabase.from("price_books").select("id, name, is_standard, is_active").order("is_standard", { ascending: false }).order("name"),
    supabase.from("price_book_entries").select("id, price_book_id, unit_price, is_active").eq("product_id", id),
    supabase.from("cases").select("id, case_number, subject, status, created_at").eq("product_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <RecordLayout
      def={def}
      row={row}
      title={String(row.name)}
      basePath={`/productos/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={row.is_active ? null : <span className="badge">Inactivo</span>}
      actions={
        <>
          {access.canEdit && <Link href={`/productos/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> Editar</Link>}
          {access.canDelete && <DeleteButton object="products" id={id} label={`el producto “${row.name}”`} />}
        </>
      }
      tabs={[{
        key: "precios",
        label: "Precios",
        content: (
          <>
            <section className="card overflow-hidden">
              <div className="card-header"><h2 className="card-title">Precios por lista</h2></div>
              <ul className="divide-y divide-[var(--border)]">
                {(books ?? []).map((b) => {
                  const entry = (entries ?? []).find((e) => e.price_book_id === b.id);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-48 flex-1">
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted">
                          {b.is_standard ? "Lista estándar" : "Lista personalizada"}{b.is_active ? "" : " · inactiva"}
                          {entry ? ` · ${formatCurrency(entry.unit_price)}` : " · sin precio"}
                        </p>
                      </div>
                      {access.canEdit ? (
                        <>
                          <ActionForm action={saveProductPrice.bind(null, id, b.id)} className="flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor={`price-${b.id}`}>Precio en {b.name}</label>
                            <input id={`price-${b.id}`} name="unit_price" inputMode="decimal" className="input num w-40"
                              defaultValue={entry ? String(entry.unit_price) : ""} placeholder="Precio COP" />
                            <label className="flex items-center gap-1.5 text-xs font-medium">
                              <input type="checkbox" name="is_active" defaultChecked={entry?.is_active ?? true} className="accent-[var(--brand)]" /> Activo
                            </label>
                            <SubmitButton className="btn btn-sm" pendingText="…">{entry ? "Guardar" : "Agregar"}</SubmitButton>
                          </ActionForm>
                          {entry && (
                            <ActionForm action={removeProductPrice.bind(null, entry.id)}>
                              <ConfirmSubmit message={`¿Quitar el precio de “${b.name}”?`}><Trash2 size={14} /><span className="sr-only">Quitar</span></ConfirmSubmit>
                            </ActionForm>
                          )}
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="card overflow-hidden">
              <div className="card-header"><h2 className="card-title">Casos de servicio <span className="badge">{cases?.length ?? 0}</span></h2></div>
              {(cases ?? []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">Sin casos para este producto.</p> : (
                <table className="table">
                  <thead><tr><th>Caso</th><th>Asunto</th><th>Estado</th><th>Abierto</th></tr></thead>
                  <tbody>
                    {(cases ?? []).map((c) => (
                      <tr key={c.id}>
                        <td><Link href={`/casos/${c.id}`} className="link">{c.case_number}</Link></td>
                        <td>{c.subject}</td>
                        <td><span className="badge">{c.status}</span></td>
                        <td>{formatDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ),
      }]}
      activity={null}
    />
  );
}
