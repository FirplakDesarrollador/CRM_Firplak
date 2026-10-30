import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { Alert } from "@/components/ui/Alert";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { OBJECTS, type ObjectKey } from "@/lib/objects";
import { getT } from "@/lib/i18n/server";
import { purgeDemoData } from "./actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Configuración" };

export default async function SetupHome() {
  const [me, t] = await Promise.all([requireUser(), getT()]);
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [users, roles, profiles, pipelines, fields, demo] = await Promise.all([
    supabase.from("profiles").select("id", head).eq("is_active", true),
    supabase.from("roles").select("id", head),
    supabase.from("permission_profiles").select("id", head),
    supabase.from("pipelines").select("id", head).eq("is_active", true),
    supabase.from("custom_field_definitions").select("id", head).eq("is_active", true),
    supabase.rpc("demo_data_counts"),
  ]);
  const demoCounts = Object.entries((demo.data ?? {}) as Record<string, number>).filter(([, n]) => Number(n) > 0);
  const cards = [
    { href: "/configuracion/usuarios", title: "Usuarios activos", value: users.count, text: "Asigna rol, perfil de permisos y jefe directo." },
    { href: "/configuracion/roles", title: "Roles", value: roles.count, text: "La jerarquía define qué registros ve cada gerente." },
    { href: "/configuracion/perfiles", title: "Perfiles de permisos", value: profiles.count, text: "Qué puede leer, crear, editar o eliminar cada perfil." },
    { href: "/configuracion/pipelines", title: "Pipelines activos", value: pipelines.count, text: "Etapas, probabilidades y categorías de pronóstico." },
    { href: "/configuracion/campos", title: "Campos personalizados", value: fields.count, text: "Campos propios por objeto, guardados en JSON." },
    { href: "/configuracion/compartir", title: "Compartir por defecto", value: null, text: "Visibilidad base de cada objeto para toda la empresa." },
  ];
  return (
    <>
      <h1 className="text-xl font-medium"><Tr>Configuración</Tr></h1>
      {!hasServiceRole() && (
        <Alert tone="info">
          Para invitar usuarios por correo desde aquí, agrega <code>SUPABASE_SERVICE_ROLE_KEY</code> en <code>.env.local</code> (solo servidor).
          Sin ella, los usuarios se registran en <code>/registro</code> y luego les asignas rol y perfil.
        </Alert>
      )}
      {demoCounts.length > 0 && canSystem(me.access, "manage_users") && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-60 flex-1">
            <p className="text-sm font-semibold"><Tr>Datos de ejemplo</Tr></p>
            <p className="mt-1 text-xs text-muted">
              {demoCounts.map(([k, n]) => `${n} ${t(OBJECTS[k as ObjectKey]?.plural ?? k).toLowerCase()}`).join(" · ")}.{" "}
              <Tr>Antes de cargar tus datos reales, bórralos: se conservan los usuarios y toda la configuración (perfiles, roles, pipelines, campos, listas, reglas, procesos, informes y plantillas).</Tr>
            </p>
          </div>
          <ActionForm action={purgeDemoData} className="flex flex-col items-end gap-1">
            <ConfirmSubmit message={t("¿Borrar todos los datos de ejemplo? Esta acción no se puede deshacer.")}>
              <Tr>Borrar datos de ejemplo</Tr>
            </ConfirmSubmit>
          </ActionForm>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card block p-4 no-underline transition hover:border-brand">
            <p className="text-sm font-semibold">{c.title}</p>
            {c.value !== null && <p className="kpi-value mt-1">{c.value ?? 0}</p>}
            <p className="mt-1 text-xs text-muted">{c.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
