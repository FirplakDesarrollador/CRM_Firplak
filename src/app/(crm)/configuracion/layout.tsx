import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import { SetupNav } from "./SetupNav";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const users = canSystem(user.access, "manage_users");
  const customize = canSystem(user.access, "customize");
  if (!users && !customize) redirect("/inicio");
  const items = [
    { href: "/configuracion", label: "Resumen", group: "General" },
    ...(users ? [
      { href: "/configuracion/usuarios", label: "Usuarios", group: "Usuarios y acceso" },
      { href: "/configuracion/roles", label: "Jerarquía de roles", group: "Usuarios y acceso" },
      { href: "/configuracion/perfiles", label: "Perfiles y permisos", group: "Usuarios y acceso" },
    ] : []),
    ...(customize ? [
      { href: "/configuracion/compartir", label: "Compartir por defecto", group: "Usuarios y acceso" },
      { href: "/configuracion/pipelines", label: "Pipelines y etapas", group: "Personalización" },
      { href: "/configuracion/campos", label: "Campos personalizados", group: "Personalización" },
    ] : []),
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside><SetupNav items={items} /></aside>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
