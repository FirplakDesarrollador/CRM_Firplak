import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { RecordLayout } from "@/components/records/RecordLayout";
import { StatusPath } from "@/components/records/StatusPath";
import { DeleteButton } from "@/components/records/DeleteButton";
import { RelatedList } from "@/components/records/RelatedList";
import { KpiTile } from "@/components/dashboard/Charts";
import { getObjectDef, getRecord, getRecordAccess, untypedClient, type Row } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { CAMPAIGN_STATUSES } from "@/lib/objects/picklists";
import { can } from "@/lib/permissions";
import { formatMillions, formatPercent } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { Members, type Member } from "./Members";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Campaña" };

export default async function CampaignDetailPage({ params, searchParams }: PageProps<"/campanas/[id]">) {
  const t = await getT();
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const [def, oppsDef, leadsDef] = await Promise.all([getObjectDef("campaigns"), getObjectDef("opportunities"), getObjectDef("leads")]);
  const row = await getRecord(def, id);
  if (!row) notFound();
  const supabase = await createClient();
  const db = await untypedClient();
  const [access, { data: members }, opps, leads] = await Promise.all([
    getRecordAccess("campaigns", row.owner_id as string | null),
    supabase
      .from("campaign_members")
      .select("id, status, lead:leads!campaign_members_lead_id_fkey(id, full_name, company), contact:contacts!campaign_members_contact_id_fkey(id, full_name, account:accounts!contacts_account_id_fkey(name))")
      .eq("campaign_id", id)
      .order("created_at"),
    db.from("opportunities").select(oppsDef.select).eq("campaign_id", id).order("close_date", { ascending: false }),
    db.from("leads").select(leadsDef.select).eq("campaign_id", id).order("created_at", { ascending: false }),
  ]);
  const memberRows = (members ?? []) as unknown as Member[];
  const oppRows = (opps.data ?? []) as unknown as Row[];
  const responded = memberRows.filter((m) => ["Respondió", "Asistió"].includes(m.status)).length;
  const won = oppRows.filter((o) => o.is_won).reduce((s, o) => s + Number(o.amount), 0);
  const pipeline = oppRows.filter((o) => !o.is_closed).reduce((s, o) => s + Number(o.amount), 0);
  const cost = Number(row.actual_cost ?? row.budgeted_cost ?? 0);

  return (
    <RecordLayout
      def={def}
      row={row}
      title={String(row.name)}
      basePath={`/campanas/${id}`}
      activeTab={typeof sp.tab === "string" ? sp.tab : undefined}
      actions={
        <>
          {can(user.access, "leads", "create") && <Link href={`/prospectos/nuevo?campaign=${id}`} className="btn"><Plus size={15} /> <Tr>Prospecto</Tr></Link>}
          {access.canEdit && <Link href={`/campanas/${id}/editar`} className="btn btn-primary"><Pencil size={15} /> <Tr>Editar</Tr></Link>}
          {access.canDelete && <DeleteButton object="campaigns" id={id} label={`la campaña “${row.name}”`} />}
        </>
      }
      headerExtra={<StatusPath object="campaigns" id={id} options={CAMPAIGN_STATUSES} current={String(row.status)} canEdit={access.canEdit} negative={["Cancelada"]} />}
      tabs={[{
        key: "resultados",
        label: "Resultados",
        content: (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile label="Miembros" value={String(memberRows.length)} sub={`${responded} ${t("respondieron")} (${memberRows.length ? formatPercent((responded / memberRows.length) * 100) : "—"})`} />
              <KpiTile label="Prospectos generados" value={String(leads.data?.length ?? 0)} />
              <KpiTile label="Ventas ganadas" {...formatMillions(won)} sub={`${t("Pipeline abierto:")} ${formatMillions(pipeline).value} M`} tone="success" />
              <KpiTile label="Retorno" value={cost ? formatPercent(((won - cost) / cost) * 100) : "—"} sub={cost ? `${t("Costo:")} ${formatMillions(cost).value} M` : t("Sin costo registrado")} />
            </div>
            <Members campaignId={id} members={memberRows} canEdit={access.canEdit} />
            <RelatedList def={oppsDef} title="Oportunidades influenciadas" rows={oppRows} columns={["name", "account_id", "stage_id", "amount", "close_date"]} />
            <RelatedList def={leadsDef} title="Prospectos de la campaña" rows={(leads.data ?? []) as unknown as Row[]} columns={["full_name", "company", "status", "owner_id"]}
              newHref={can(user.access, "leads", "create") ? `/prospectos/nuevo?campaign=${id}` : undefined} />
          </>
        ),
      }]}
      activity={null}
    />
  );
}
