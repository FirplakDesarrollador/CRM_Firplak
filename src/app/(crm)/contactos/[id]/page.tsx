import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Pencil, Phone, Plus } from "lucide-react";
import { RecordHeader } from "@/components/records/RecordHeader";
import { DetailSections } from "@/components/records/DetailSections";
import { RelatedList } from "@/components/records/RelatedList";
import { DeleteButton } from "@/components/records/DeleteButton";
import { Tabs } from "@/components/records/Tabs";
import { FieldHistory } from "@/components/records/FieldHistory";
import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { getActivitiesFor } from "@/components/activities/data";
import { getObjectDef, getRecord, getRecordAccess, getUsers, untypedClient, type Row } from "@/lib/records/data";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/contactos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await getRecord(await getObjectDef("contacts"), id);
  return { title: (row?.full_name as string) ?? "Contacto" };
}

export default async function ContactDetailPage({ params, searchParams }: PageProps<"/contactos/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const [def, oppsDef, casesDef] = await Promise.all([getObjectDef("contacts"), getObjectDef("opportunities"), getObjectDef("cases")]);
  const row = await getRecord(def, id);
  if (!row) notFound();

  const db = await untypedClient();
  const [access, users, activities, opps, reports, cases] = await Promise.all([
    getRecordAccess("contacts", row.owner_id as string | null),
    getUsers(),
    getActivitiesFor({ contact_id: id }),
    db.from("opportunities").select(oppsDef.select).eq("contact_id", id).order("close_date", { ascending: false }).limit(50),
    db.from("contacts").select(def.select).eq("reports_to_id", id).order("last_name").limit(50),
    db.from("cases").select(casesDef.select).eq("contact_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const tab = sp.tab === "detalles" ? "detalles" : sp.tab === "historial" ? "historial" : "relacionado";
  const path = `/contactos/${id}`;
  const accountId = (row.account_id as string | null) ?? null;
  const flags = [row.do_not_call && "No llamar", row.email_opt_out && "No enviar correos"].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <RecordHeader
        def={def}
        row={row}
        title={`${row.salutation ? `${row.salutation} ` : ""}${row.full_name}`}
        badges={flags.map((f) => <span key={f} className="badge badge-warning">{f}</span>)}
        actions={
          <>
            {typeof row.mobile === "string" && row.mobile && (
              <a href={`https://wa.me/${row.mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn"><Phone size={15} /> WhatsApp</a>
            )}
            {typeof row.email === "string" && row.email && !row.email_opt_out && (
              <Link href={`/correo/nuevo?contacto=${id}`} className="btn"><Mail size={15} /> Enviar correo</Link>
            )}
            {can(user.access, "opportunities", "create") && (
              <Link href={`/oportunidades/nueva?contact=${id}${accountId ? `&account=${accountId}` : ""}`} className="btn"><Plus size={15} /> Oportunidad</Link>
            )}
            {access.canEdit && <Link href={`${path}/editar`} className="btn btn-primary"><Pencil size={15} /> Editar</Link>}
            {access.canDelete && <DeleteButton object="contacts" id={id} label={`el contacto “${row.full_name}”`} />}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <div className="card">
            <Tabs basePath={path} active={tab} tabs={[{ key: "relacionado", label: "Relacionado" }, { key: "detalles", label: "Detalles" }, { key: "historial", label: "Historial de cambios" }]} />
          </div>
          {tab === "historial" ? (
            <FieldHistory object="contacts" recordId={id} />
          ) : tab === "detalles" ? (
            <DetailSections def={def} row={row} />
          ) : (
            <>
              <RelatedList def={oppsDef} title="Oportunidades como contacto principal" rows={(opps.data ?? []) as unknown as Row[]}
                columns={["name", "account_id", "stage_id", "amount", "close_date"]} />
              <RelatedList def={casesDef} title="Casos" rows={(cases.data ?? []) as unknown as Row[]}
                columns={["case_number", "subject", "status", "priority", "created_at"]}
                newHref={can(user.access, "cases", "create") ? `/casos/nuevo?contact=${id}` : undefined} />
              <RelatedList def={def} title="Le reportan" rows={(reports.data ?? []) as unknown as Row[]}
                columns={["full_name", "title", "email", "mobile"]} emptyText="Nadie reporta a este contacto." />
            </>
          )}
        </div>
        <ActivityPanel related={{ contact_id: id, account_id: accountId }} activities={activities} users={users}
          userId={user.id} canCreate={can(user.access, "activities", "create")} />
      </div>
    </div>
  );
}
