import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, Pencil } from "lucide-react";
import { RelatedList } from "@/components/records/RelatedList";
import { RecordHeader } from "@/components/records/RecordHeader";
import { ApprovalStrip } from "@/components/records/RecordLayout";
import { DetailSections } from "@/components/records/DetailSections";
import { DeleteButton } from "@/components/records/DeleteButton";
import { Tabs } from "@/components/records/Tabs";
import { StageBadge } from "@/components/records/FieldValue";
import { FieldHistory } from "@/components/records/FieldHistory";
import { StagePath } from "@/components/opportunities/StagePath";
import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { ActivityJump } from "@/components/activities/ActivityJump";
import { TeamCard } from "@/components/teams/TeamCard";
import { DocumentsCard } from "@/components/ms365/DocumentsCard";
import { SplitsCard, getSplits } from "@/components/splits/SplitsCard";
import { getActivitiesFor } from "@/components/activities/data";
import { getObjectDef, getPipelines, getRecord, getRecordAccess, getUsers, untypedClient, type Row } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatCurrency, relativeDays } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";

import { Tr } from "@/components/ui/Tr";
import { Alert } from "@/components/ui/Alert";
import { Fmt } from "@/components/ui/Fmt";
export async function generateMetadata({ params }: PageProps<"/oportunidades/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await getRecord(await getObjectDef("opportunities"), id);
  return { title: (row?.name as string) ?? "Oportunidad" };
}

export default async function OpportunityDetailPage({ params, searchParams }: PageProps<"/oportunidades/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const [def, quotesDef, ordersDef] = await Promise.all([getObjectDef("opportunities"), getObjectDef("quotes"), getObjectDef("orders")]);
  const row = await getRecord(def, id);
  if (!row) notFound();

  const supabase = await createClient();
  const db = await untypedClient();
  const [access, users, pipelines, activities, history, quotesRes, ordersRes, splits, partsRes] = await Promise.all([
    getRecordAccess("opportunities", row.owner_id as string | null, row.id),
    getUsers(),
    getPipelines(),
    getActivitiesFor({ opportunity_id: id }),
    supabase
      .from("opportunity_stage_history")
      .select("id, changed_at, amount, probability, from:pipeline_stages!opportunity_stage_history_from_stage_id_fkey(name, color, category), to:pipeline_stages!opportunity_stage_history_to_stage_id_fkey(name, color, category), by:profiles!opportunity_stage_history_changed_by_fkey(full_name)")
      .eq("opportunity_id", id)
      .order("changed_at", { ascending: false }),
    db.from("quotes").select(quotesDef.select).eq("opportunity_id", id).order("created_at", { ascending: false }),
    db.from("orders").select(ordersDef.select).eq("opportunity_id", id).order("order_date", { ascending: false }),
    getSplits(id),
    // Partes ganadas que se separaron de esta oportunidad al aceptarse su cotización.
    db.from("opportunities").select(def.select).eq("parent_opportunity_id", id).order("close_date", { ascending: false }),
  ]);
  const partRows = (partsRes.data ?? []) as unknown as Row[];
  const orderRows = (ordersRes.data ?? []) as unknown as Row[];
  const quoteRows = (quotesRes.data ?? []) as unknown as Row[];
  // Ganada a mano con partes todavía abiertas: se avisa cuáles.
  const openParts = row.is_won ? quoteRows.filter((q) => !["Aceptada", "Rechazada", "Reemplazada"].includes(String(q.status))) : [];
  const stages = pipelines.find((p) => p.id === row.pipeline_id)?.stages ?? [];
  const tab = (["historial", "cotizaciones", "pedidos", "equipo", "documentos", "cambios"] as const).find((k) => k === sp.tab) ?? "detalles";
  const owner = row.owner as { full_name?: string; email?: string } | null;
  const path = `/oportunidades/${id}`;
  const locale = await getLocale();
  const t = makeT(locale);
  const closeIn = !row.is_closed ? relativeDays(String(row.close_date), locale) : null;
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
            {splits.length > 1 && (
              <span className="badge badge-brand" title={splits.map((s) => `${s.user?.full_name ?? ""} ${Number(s.percent)} %`).join(" · ")}>
                {t("Compartida")} {splits.map((s) => Number(s.percent)).join("/")}
              </span>
            )}
            {closeIn && <span className={`badge ${late ? "badge-danger" : "badge-info"}`}>{late ? t("Cierre vencido") : `${t("Cierra:")} ${closeIn.toLowerCase()}`}</span>}
          </>
        }
        actions={
          <>
            {row.contact_id ? <Link href={`/correo/nuevo?oportunidad=${id}`} className="btn"><Mail size={15} /> <Tr>Enviar correo</Tr></Link> : null}
            {!row.is_closed && can(user.access, "quotes", "create") && (
              <Link href={`/cotizaciones/nueva?opportunity=${id}`} className="btn"><FileText size={15} /> <Tr>Nueva cotización</Tr></Link>
            )}
            {access.canEdit && <Link href={`${path}/editar`} className="btn btn-primary"><Pencil size={15} /> <Tr>Editar</Tr></Link>}
            {access.canDelete && <DeleteButton object="opportunities" id={id} label={`la oportunidad “${row.name}”`} />}
          </>
        }
      >
        <StagePath opportunityId={id} stages={stages} currentStageId={String(row.stage_id)} canEdit={access.canEdit}
          lossReasons={def.fields.find((f) => f.name === "loss_reason")?.options} />
        <ApprovalStrip def={def} row={row} basePath={path} />
      </RecordHeader>

      <ActivityJump />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <div className="card">
            <Tabs basePath={path} active={tab} tabs={[
              { key: "detalles", label: "Detalles" },
              { key: "cotizaciones", label: "Cotizaciones", count: quoteRows.length },
              ...(can(user.access, "orders", "read") ? [{ key: "pedidos", label: "Pedidos", count: orderRows.length }] : []),
              { key: "equipo", label: "Equipo y reparto" },
              { key: "documentos", label: "Documentos" },
              { key: "historial", label: "Historial de etapas", count: history.data?.length ?? 0 },
              { key: "cambios", label: "Historial de cambios" },
            ]} />
          </div>
          {tab === "cambios" ? (
            <FieldHistory object="opportunities" recordId={id} />
          ) : tab === "documentos" ? (
            <DocumentsCard object="opportunities" recordId={id} recordName={String(row.name)} userId={user.id} />
          ) : tab === "equipo" ? (
            <>
              <SplitsCard opportunityId={id} ownerId={(row.owner_id as string | null) ?? null}
                ownerName={owner?.full_name || owner?.email || null} amount={Number(row.amount) || 0} />
              <TeamCard object="opportunities" recordId={id} ownerId={(row.owner_id as string | null) ?? null}
                ownerName={owner?.full_name || owner?.email || null} />
            </>
          ) : tab === "cotizaciones" ? (
            <div className="space-y-4">
              {openParts.length > 0 && (
                <Alert tone="warning">
                  {t("La oportunidad está ganada y estas cotizaciones siguen abiertas:")}{" "}
                  {openParts.map((q) => String(q.quote_number)).join(", ")}.{" "}
                  {t("Acéptalas, recházalas o márcalas como reemplazadas.")}
                </Alert>
              )}
              <p className="px-1 text-sm text-muted">
                {t("Cada cotización es una parte del negocio: el valor de la oportunidad es la suma de las partes abiertas. Al aceptarse una parte mientras otras siguen abiertas, se separa en su propia oportunidad ganada.")}
              </p>
              <RelatedList def={quotesDef} title="Cotizaciones" rows={quoteRows}
                columns={["quote_number", "name", "status", "net_total", "grand_total", "expiration_date"]}
                newHref={!row.is_closed && can(user.access, "quotes", "create") ? `/cotizaciones/nueva?opportunity=${id}` : undefined} />
              {partRows.length > 0 && (
                <RelatedList def={def} title="Partes ganadas" rows={partRows} columns={["name", "stage_id", "amount", "close_date"]} />
              )}
            </div>
          ) : tab === "pedidos" ? (
            <RelatedList def={ordersDef} title="Pedidos" rows={orderRows}
              columns={["order_number", "name", "status", "order_date", "requested_delivery_date", "net_total"]}
              newHref={can(user.access, "orders", "create") ? `/pedidos/nuevo?opportunity=${id}` : undefined} />
          ) : tab === "historial" ? (
            <section className="card overflow-x-auto">
              <table className="table">
                <thead><tr><th><Tr>Fecha</Tr></th><th><Tr>De</Tr></th><th>A</th><th className="text-right"><Tr>Valor</Tr></th><th className="text-right"><Tr>Prob.</Tr></th><th><Tr>Por</Tr></th></tr></thead>
                <tbody>
                  {(history.data ?? []).map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap"><Fmt datetime={h.changed_at} /></td>
                      <td>{h.from ? <StageBadge stage={h.from as never} /> : <span className="text-muted"><Tr>Creación</Tr></span>}</td>
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
