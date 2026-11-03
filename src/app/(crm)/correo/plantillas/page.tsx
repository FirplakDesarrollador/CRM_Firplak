import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { deleteTemplate, saveTemplate } from "@/lib/email/actions";
import { MERGE_FIELDS } from "@/lib/email/merge";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Plantillas de correo" };

function TemplateFields({ t, canShare }: { t?: { id: string; name: string; category: string; subject: string; body: string; is_shared: boolean; is_active: boolean }; canShare: boolean }) {
  const id = t?.id ?? "new";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`n-${id}`}><Tr>Nombre</Tr></label><input id={`n-${id}`} name="name" className="input" defaultValue={t?.name} required /></div>
        <div><label className="label" htmlFor={`c-${id}`}><Tr>Categoría</Tr></label><input id={`c-${id}`} name="category" className="input" defaultValue={t?.category ?? "General"} /></div>
      </div>
      <div><label className="label" htmlFor={`s-${id}`}><Tr>Asunto</Tr></label><input id={`s-${id}`} name="subject" className="input" defaultValue={t?.subject} /></div>
      <div><label className="label" htmlFor={`b-${id}`}><Tr>Mensaje</Tr></label><textarea id={`b-${id}`} name="body" rows={7} className="textarea" defaultValue={t?.body} /></div>
      <div className="flex flex-wrap items-center gap-4">
        {canShare && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_shared" defaultChecked={t?.is_shared} className="accent-[var(--brand)]" /> <Tr>Compartida con el equipo</Tr></label>}
        {t && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_active" defaultChecked={t.is_active} className="accent-[var(--brand)]" /> <Tr>Activa</Tr></label>}
        <SubmitButton className="btn btn-primary ml-auto" pendingText="Guardando…">{t ? "Guardar" : "Crear plantilla"}</SubmitButton>
      </div>
    </>
  );
}

export default async function TemplatesPage() {
  const user = await requireUser();
  const canShare = canSystem(user.access, "customize");
  const supabase = await createClient();
  const { data } = await supabase.from("email_templates").select("*").order("category").order("name");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <ObjectIcon object="activities" />
        <div>
          <h1 className="text-xl font-medium"><Tr>Plantillas de correo</Tr></h1>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <section className="glass p-5">
            <h2 className="card-title"><Tr>Nueva plantilla</Tr></h2>
            <ActionForm action={saveTemplate.bind(null, null)} resetOnSuccess className="mt-3 space-y-3">
              <TemplateFields canShare={canShare} />
            </ActionForm>
          </section>
          {(data ?? []).map((t) => {
            const editable = t.owner_id === user.id || (t.is_shared && canShare);
            return (
              <details key={t.id} className="card group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted">{t.category}</span>
                  </span>
                  <span className="flex gap-1.5">
                    {t.is_shared && <span className="badge"><Tr>Compartida</Tr></span>}
                    {!t.is_active && <span className="badge"><Tr>Inactiva</Tr></span>}
                  </span>
                </summary>
                <div className="border-t border-line p-5">
                  {editable ? (
                    <>
                      <ActionForm action={saveTemplate.bind(null, t.id)} className="space-y-3">
                        <TemplateFields t={t} canShare={canShare} />
                      </ActionForm>
                      <ActionForm action={deleteTemplate.bind(null, t.id)} className="mt-3 flex flex-col items-end">
                        <ConfirmSubmit message={`¿Eliminar la plantilla “${t.name}”?`}><Trash2 size={14} /> <Tr>Eliminar</Tr></ConfirmSubmit>
                      </ActionForm>
                    </>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted"><Tr>Asunto:</Tr></span> {t.subject}</p>
                      <p className="whitespace-pre-line text-ink-2">{t.body}</p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
        <aside className="glass h-fit p-5">
          <p className="eyebrow"><Tr>Campos combinables</Tr></p>
          <ul className="mt-3 space-y-1.5 text-xs">
            {MERGE_FIELDS.map((f) => (
              <li key={f.key}><code className="rounded bg-surface-3 px-1 py-0.5">{`{{${f.key}}}`}</code><br /><span className="text-muted">{f.label}</span></li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
