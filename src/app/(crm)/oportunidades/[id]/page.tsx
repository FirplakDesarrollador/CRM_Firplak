import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, Pencil } from "lucide-react";
import { RelatedList } from "@/components/records/RelatedList";
import { RecordHeader } from "@/components/records/RecordHeader";
import { DetailSections } from "@/components/records/DetailSections";
import { DeleteButton } from "@/components/records/DeleteButton";
import { Tabs } from "@/components/records/Tabs";
import { StageBadge } from "@/components/records/FieldValue";
import { StagePath } from "@/components/opportunities/StagePath";
import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { getActivitiesFor } from "@/components/activities/data";
import { getObjectDef, getPipelines, getRecord, getRecordAccess, getUsers, untypedClient, type Row } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDateTime, relativeDays } from "@/lib/format";
import { requireUser } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/oportunidades/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await getRecord(await getObjectDef("opportunities"), id);
  return { title: (row?.name as string) ?? "Oportunidad" };
}

export default async function OpportunityDetailPage({ params, searchParams }: PageProps<"/oportunidades/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const [def, quotesDef] = await Promise.all([getObjectDef("opportunities"), getObjectDef("quotes")]);
  const row = await getRecord(def, id);
  if (!row) notFound();

  const supabase = await createClient();
  const db = await untypedClient();
  const [access, users, pipelines, activities, history, quotesRes] = await Promise.all([
    getRecordAccess("opportunities", row.owner_id as string | null),
    getUsers(),
    getPipelines(),
    getActivitiesFor({ opportunity_id: id }),
    supabase
      .from("opportunity_stage_history")
      .select("id, changed_at, amount, probability, from:pipeline_stages!opportunity_stage_history_from_stage_id_fkey(name, color, category), to:pipeline_stages!opportunity_stage_history_to_stage_id_fkey(name, color, category), by:profiles!opportunity_stage_history_changed_by_fkey(full_name)")
      .eq("opportunity_id", id)
      .order("changed_at", { ascending: false }),
    db.from("quotes").select(quotesDef.select).eq("opportunity_id", id).order("created_at", { ascending: false }),
  ]);
  const quoteRows = (quotesRes.data ?? []) as unknown as Row[];
  const stages = pipelines.find((p) => p.id === row.pipeline_id)?.stages ?? [];
  const tab = sp.tab === "historial" ? "historial" : sp.tab === "cotizaciones" ? "cotizaciones" : "detalles";
  const path = `/oportunidades/${id}`;
  const closeIn = !row.is_closed ? relativeDays(String(row.close_date)) : null;
  const late = !row.is_closed && String(row.close_date) < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <RecordHeader
        def={def}
        row={row}
        title={String(row.name)}
        badges={
          <>
            <StageBadge stage={row.stage as never} />
            {closeIn && <span className={`badge ${late ? "badge-danger" : "badge-info"}`}>{late ? "Cierre vencido" : `Cierra: ${closeIn.toLowerCase()}`}</span>}
          </>
        }
        actions={
          <>
            {row.contact_id ? <Link href={`/correo/nuevo?oportunidad=${id}`} className="btn"><Mail size={15} /> Enviar correo</Link> : null}
            {can(user.access, "quotes", "create") && (
              <Link href={`/cotizaciones/nueva?opportunity=${id}`} className="btn"><FileText size={15} /> Nueva cotización</Link>
            )}
            {access.canEdit && <Link href={`${path}/editar`} className="btn btn-primary"><Pencil size={15} /> Editar</Link>}
            {access.canDelete && <DeleteButton object="opportunities" id={id} label={`la oportunidad “${row.name}”`} />}
          </>
        }
      >
        <StagePath opportunityId={id} stages={stages} currentStageId={String(row.stage_id)} canEdit={access.canEdit} />
      </RecordHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <div className="card">
            <Tabs basePath={path} active={tab} tabs={[
              { key: "detalles", label: "Detalles" },
              { key: "cotizaciones", label: "Cotizaciones", count: quoteRows.length },
              { key: "historial", label: "Historial de etapas", count: history.data?.length ?? 0 },
            ]} />
          </div>
          {tab === "cotizaciones" ? (
            <RelatedList def={quotesDef} title="Cotizaciones" rows={quoteRows}
              columns={["quote_number", "name", "status", "net_total", "grand_total", "is_synced", "expiration_date"]}
              newHref={can(user.access, "quotes", "create") ? `/cotizaciones/nueva?opportunity=${id}` : undefined} />
          ) : tab === "historial" ? (
            <section className="card overflow-x-auto">
              <table className="table">
                <thead><tr><th>Fecha</th><th>De</th><th>A</th><th className="text-right">Valor</th><th className="text-right">Prob.</th><th>Por</th></tr></thead>
                <tbody>
                  {(history.data ?? []).map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap">{formatDateTime(h.changed_at)}</td>
                      <td>{h.from ? <StageBadge stage={h.from as never} /> : <span className="text-muted">Creación</span>}</td>
                      <td><StageBadge stage={h.to as never} /></td>
                      <td className="num text-right">{formatCurrency(h.amount)}</td>
                      <td className="num text-right">{h.probability ?? "—"}%</td>
                      <td>{h.by?.full_name ?? "Sistema"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <DetailSections def={def} row={row} />
          )}
        </div>
        <ActivityPanel
          related={{ opportunity_id: id, account_id: (row.account_id as string | null) ?? null, contact_id: (row.contact_id as string | null) ?? null }}
          activities={activities}
          users={users}
          userId={user.id}
          canCreate={can(user.access, "activities", "create")}
        />
      </div>
    </div>
  );
}
