import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FieldHistory } from "@/components/records/FieldHistory";
import { getUsers } from "@/lib/records/data";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Auditoría de cambios" };

const AUDITED: ObjectKey[] = ["leads", "accounts", "contacts", "opportunities", "quotes", "products", "cases", "campaigns"];

export default async function AuditPage({ searchParams }: PageProps<"/configuracion/auditoria">) {
  const [me, sp, users] = await Promise.all([requireUser(), searchParams, getUsers()]);
  if (!canSystem(me.access, "manage_users") && !canSystem(me.access, "customize")) redirect("/configuracion");
  const object = typeof sp.objeto === "string" && isObjectKey(sp.objeto) && AUDITED.includes(sp.objeto) ? sp.objeto : undefined;
  const userId = typeof sp.usuario === "string" && users.some((u) => u.id === sp.usuario) ? sp.usuario : undefined;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { objeto: object, usuario: userId, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/configuracion/auditoria${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Auditoría de cambios</Tr></h1>
        <p className="text-sm text-muted"><Tr>Cada creación, modificación de campo y eliminación queda registrada por la base de datos, con usuario y fecha. Se muestran los 300 cambios más recientes.</Tr></p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link href={qs({ objeto: undefined })} className={`badge py-1 ${!object ? "badge-brand" : ""}`}><Tr>Todos los objetos</Tr></Link>
        {AUDITED.map((o) => <Link key={o} href={qs({ objeto: o })} className={`badge py-1 ${object === o ? "badge-brand" : ""}`}>{OBJECTS[o].plural}</Link>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link href={qs({ usuario: undefined })} className={`badge py-1 ${!userId ? "badge-brand" : ""}`}><Tr>Todos los usuarios</Tr></Link>
        {users.map((u) => <Link key={u.id} href={qs({ usuario: u.id })} className={`badge py-1 ${userId === u.id ? "badge-brand" : ""}`}>{u.full_name}</Link>)}
      </div>
      <FieldHistory object={object} userId={userId} global limit={300} />
    </>
  );
}
