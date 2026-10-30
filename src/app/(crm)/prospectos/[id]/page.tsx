import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, Mail, Pencil, Phone } from "lucide-react";
import { RecordLayout } from "@/components/records/RecordLayout";
import { StatusPath } from "@/components/records/StatusPath";
import { DeleteButton } from "@/components/records/DeleteButton";
import { Alert } from "@/components/ui/Alert";
import { getActivitiesFor } from "@/components/activities/data";
import { getObjectDef, getRecord, getRecordAccess, getUsers } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES } from "@/lib/objects/picklists";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Prospecto" };

type Rel = { id: string; name?: string; full_name?: string } | null;

export default async function LeadDetailPage({ params, searchParams }: PageProps<"/prospectos/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const def = await getObjectDef("leads");
  const row = await getRecord(def, id);
  if (!row) notFound();

  const supabase = await createClient();
  const [access, users, activities, { data: memberships }] = await Promise.all([
    getRecordAccess("leads", row.owner_id as string | null),
    getUsers(),
    getActivitiesFor({ lead_id: id }),
    supabase.from("campaign_members").select("id, status, created_at, campaign:campaigns!campaign_members_campaign_id_fkey(id, name, status)").eq("lead_id", id),
  ]);
  const converted = Boolean(row.is_converted);
  const status = String(row.status);

  return (
    <RecordLayout
      def={def}
      row={row}
      title={`${row.salutation ? `${row.salutation} ` : ""}${row.full_name}`}
      basePath={`/prospectos/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      badges={converted ? <span className="badge badge-success">Convertido</span> : null}
      actions={
        <>
          {typeof row.mobile === "string" && row.mobile && (
            <a href={`https://wa.me/${row.mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn"><Phone size={15} /> WhatsApp</a>
          )}
          {typeof row.email === "string" && row.email && <a href={`mailto:${row.email}`} className="btn"><Mail size={15} /> Correo</a>}
          {!converted && access.canEdit && can(user.access, "accounts", "create") && can(user.access, "contacts", "create") && (
            <Link href={`/prospectos/${id}/convertir`} className="btn btn-primary"><ArrowRightLeft size={15} /> Convertir</Link>
          )}
          {!converted && access.canEdit && <Link href={`/prospectos/${id}/editar`} className="btn"><Pencil size={15} /> Editar</Link>}
          {access.canDelete && <DeleteButton object="leads" id={id} label={`el prospecto “${row.full_name}”`} />}
        </>
      }
      headerExtra={
        converted ? (
          <div className="border-t border-line px-5 py-3">
            <Alert tone="success">
              Convertido el {formatDate(String(row.converted_at))} en{" "}
              {(row.converted_account as Rel) && <Link className="link" href={`/cuentas/${(row.converted_account as Rel)!.id}`}>{(row.converted_account as Rel)!.name}</Link>}
              {(row.converted_contact as Rel) && <> · <Link className="link" href={`/contactos/${(row.converted_contact as Rel)!.id}`}>{(row.converted_contact as Rel)!.full_name}</Link></>}
              {(row.converted_opportunity as Rel) && <> · <Link className="link" href={`/oportunidades/${(row.converted_opportunity as Rel)!.id}`}>{(row.converted_opportunity as Rel)!.name}</Link></>}
            </Alert>
          </div>
        ) : (
          <StatusPath object="leads" id={id} options={LEAD_STATUSES.filter((s) => s !== "Convertido")} current={status}
            canEdit={access.canEdit} negative={["No calificado"]} />
        )
      }
      tabs={[{
        key: "relacionado",
        label: "Relacionado",
        content: (
          <section className="card overflow-hidden">
            <div className="card-header"><h2 className="card-title">Campañas <span className="badge">{memberships?.length ?? 0}</span></h2></div>
            {(memberships ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No participa en campañas.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Campaña</th><th>Estado de la campaña</th><th>Respuesta</th><th>Agregado</th></tr></thead>
                <tbody>
                  {(memberships ?? []).map((m) => (
                    <tr key={m.id}>
                      <td>{m.campaign && <Link className="link" href={`/campanas/${m.campaign.id}`}>{m.campaign.name}</Link>}</td>
                      <td>{m.campaign?.status}</td>
                      <td><span className="badge">{m.status}</span></td>
                      <td>{formatDate(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ),
      }]}
      activity={{ related: { lead_id: id }, items: activities, users, userId: user.id, canCreate: can(user.access, "activities", "create") && !converted }}
    />
  );
}
