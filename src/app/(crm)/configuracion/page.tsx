import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { Alert } from "@/components/ui/Alert";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Configuración" };

export default async function SetupHome() {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [users, roles, profiles, pipelines, fields] = await Promise.all([
    supabase.from("profiles").select("id", head).eq("is_active", true),
    supabase.from("roles").select("id", head),
    supabase.from("permission_profiles").select("id", head),
    supabase.from("pipelines").select("id", head).eq("is_active", true),
    supabase.from("custom_field_definitions").select("id", head).eq("is_active", true),
  ]);
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
