import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { canSystem, PERMISSION_OBJECTS } from "@/lib/permissions";
import { OBJECTS } from "@/lib/objects";
import { requireUser } from "@/lib/session";
import { saveSharing } from "../actions";

export const metadata: Metadata = { title: "Compartir por defecto" };

const LEVELS = [
  { value: "private", label: "Privado", text: "Solo el propietario, sus superiores en la jerarquía y quien tenga «Ver todo»." },
  { value: "read", label: "Lectura pública", text: "Todos leen; solo el propietario y sus superiores editan." },
  { value: "read_write", label: "Lectura y escritura pública", text: "Todos leen y editan (según su perfil)." },
];

export default async function SharingPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const supabase = await createClient();
  const { data } = await supabase.from("sharing_settings").select("object, access");
  const current = Object.fromEntries((data ?? []).map((r) => [r.object, r.access]));

  return (
    <>
      <div>
        <h1 className="text-xl font-medium">Compartir por defecto</h1>
        <p className="text-sm text-muted">Visibilidad base de cada objeto. Los perfiles de permisos siguen limitando lo que cada usuario puede hacer.</p>
      </div>
      <ActionForm action={saveSharing} className="card space-y-0 divide-y divide-[var(--border)]">
        {PERMISSION_OBJECTS.map((o) => (
          <fieldset key={o} className="grid gap-3 p-4 lg:grid-cols-[12rem_1fr]">
            <legend className="sr-only">{OBJECTS[o].plural}</legend>
            <p className="font-semibold">{OBJECTS[o].plural}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LEVELS.map((l) => (
                <label key={l.value} className="cursor-pointer rounded-lg border border-line-strong p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <span className="flex items-center gap-2 font-semibold">
                    <input type="radio" name={o} value={l.value} defaultChecked={(current[o] ?? "private") === l.value} className="accent-[var(--brand)]" />
                    {l.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{l.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center justify-end gap-3 p-4"><SubmitButton pendingText="Guardando…">Guardar</SubmitButton></div>
      </ActionForm>
    </>
  );
}
