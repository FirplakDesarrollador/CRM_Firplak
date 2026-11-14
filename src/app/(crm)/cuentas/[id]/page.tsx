import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { RecordHeader } from "@/components/records/RecordHeader";
import { ApprovalStrip } from "@/components/records/RecordLayout";
import { TerritoryHint } from "@/components/territories/TerritoryHint";
import { DetailSections } from "@/components/records/DetailSections";
import { RelatedList } from "@/components/records/RelatedList";
import { DeleteButton } from "@/components/records/DeleteButton";
import { Tabs } from "@/components/records/Tabs";
import { FieldHistory } from "@/components/records/FieldHistory";
import { ActivityPanel } from "@/components/activities/ActivityPanel";
import { ActivityJump } from "@/components/activities/ActivityJump";
import { TeamCard } from "@/components/teams/TeamCard";
import { DocumentsCard } from "@/components/ms365/DocumentsCard";
import { SapAccountCard } from "@/components/sap/SapCards";
import { sapAvailable } from "@/lib/sap/data";
import { canSystem } from "@/lib/permissions";
import { getActivitiesFor } from "@/components/activities/data";
import { getObjectDef, getRecord, getRecordAccess, getUsers, untypedClient, type Row } from "@/lib/records/data";
import { can } from "@/lib/permissions";
import { formatCompactCurrency } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { Alert } from "@/components/ui/Alert";

import { Tr } from "@/components/ui/Tr";
import { Val } from "@/components/ui/Val";
export async function generateMetadata({ params }: PageProps<"/cuentas/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await getRecord(await getObjectDef("accounts"), id);
  return { title: (row?.name as string) ?? "Cuenta" };
}

export default async function AccountDetailPage({ params, searchParams }: PageProps<"/cuentas/[id]">) {
  const [user, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  const [def, contactsDef, oppsDef, quotesDef, casesDef, ordersDef] = await Promise.all([
    getObjectDef("accounts"), getObjectDef("contacts"), getObjectDef("opportunities"), getObjectDef("quotes"), getObjectDef("cases"),
    getObjectDef("orders"),
  ]);
  const row = await getRecord(def, id);
  if (!row) notFound();

  const db = await untypedClient();
  const [access, users, activities, contacts, opps, children, quotes, cases, orders] = await Promise.all([
    getRecordAccess("accounts", row.owner_id as string | null, row.id),
    getUsers(),
    getActivitiesFor({ account_id: id }),
    db.from("contacts").select(contactsDef.select).eq("account_id", id).order("last_name").limit(50),
    db.from("opportunities").select(oppsDef.select).eq("account_id", id).order("close_date", { ascending: false }).limit(50),
    db.from("accounts").select(def.select).eq("parent_account_id", id).order("name").limit(50),
    db.from("quotes").select(quotesDef.select).eq("account_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("cases").select(casesDef.select).eq("account_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("orders").select(ordersDef.select).eq("account_id", id).order("order_date", { ascending: false }).limit(50),
  ]);
  const oppRows = (opps.data ?? []) as unknown as Row[];
  // Tras un cambio de mercado: borradores con productos y oportunidades abiertas que quedaron en la moneda anterior.
  const t = await getT();
  const marketCurrency = row.market === "Internacional" ? "USD" : "COP";
  const staleQuotes = ((quotes.data ?? []) as unknown as Row[]).filter((q) => q.status === "Borrador" && q.currency !== marketCurrency);
  const staleOpps = oppRows.filter((o) => !o.is_closed && o.currency !== marketCurrency);
  const openAmount = oppRows.filter((o) => !o.is_closed).reduce((s, o) => s + Number(o.amount), 0);
  const wonAmount = oppRows.filter((o) => o.is_won).reduce((s, o) => s + Number(o.amount), 0);
  // SAP: solo con el permiso «Ver información de SAP» y con SAP disponible (en vivo o por el agente).
  const showSap = canSystem(user.access, "view_sap") && (await sapAvailable());
  const tab = (["detalles", "equipo", "documentos", "historial", ...(showSap ? ["sap" as const] : [])] as const).find((k) => k === sp.tab) ?? "relacionado";
  const owner = row.owner as { full_name?: string; email?: string } | null;
  const path = `/cuentas/${id}`;

  return (
    <div className="space-y-4">
      <RecordHeader
        def={def}
        row={row}
        title={String(row.name)}
        badges={row.rating ? <span className={`badge ${row.rating === "Caliente" ? "badge-accent" : row.rating === "Templada" ? "" : "badge-info"}`}><Val>{String(row.rating)}</Val></span> : null}
        actions={
          <>
            {can(user.access, "opportunities", "create") && (
              <Link href={`/oportunidades/nueva?account=${id}`} className="btn"><Plus size={15} /> <Tr>Oportunidad</Tr></Link>
            )}
            {can(user.access, "contacts", "create") && (
              <Link href={`/contactos/nuevo?account=${id}`} className="btn"><Plus size={15} /> <Tr>Contacto</Tr></Link>
            )}
            {access.canEdit && <Link href={`${path}/editar`} className="btn btn-primary"><Pencil size={15} /> <Tr>Editar</Tr></Link>}
            {access.canDelete && <DeleteButton object="accounts" id={id} label={`la cuenta “${row.name}”`} />}
          </>
        }
      >
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted">
          <span><Tr>Pipeline abierto:</Tr> <span className="num text-ink">{formatCompactCurrency(openAmount)}</span></span>
          <span><Tr>Ganado histórico:</Tr> <span className="num text-success">{formatCompactCurrency(wonAmount)}</span></span>
          <span><Tr>N.º cuenta:</Tr> <span className="text-ink">{String(row.account_number)}</span></span>
        </div>
        <TerritoryHint channel={(row.industry as string | null) ?? null} market={(row.market as string | null) ?? null} zone={(row.zone as string | null) ?? null}
          department={(row.billing_state as string | null) ?? null} country={(row.billing_country as string | null) ?? null} ownerId={(row.owner_id as string | null) ?? null} />
        <ApprovalStrip def={def} row={row} basePath={path} />
      </RecordHeader>

      {(staleQuotes.length > 0 || staleOpps.length > 0) && (
        <Alert tone="warning">
          <p>
            {t("Esta cuenta es del mercado {mercado} ({moneda}). Revisa lo que quedó en la moneda anterior:")
              .replace("{mercado}", t(row.market === "Internacional" ? "Internacional" : "Nacional")).replace("{moneda}", marketCurrency)}{" "}
            {[
              ...staleQuotes.map((q) => <Link key={String(q.id)} href={`/cotizaciones/${q.id}`} className="link">{String(q.quote_number)}</Link>),
              ...staleOpps.map((o) => <Link key={String(o.id)} href={`/oportunidades/${o.id}`} className="link">{String(o.name)}</Link>),
            ].flatMap((el, i) => (i ? [", ", el] : [el]))}
          </p>
          <p className="mt-1 font-normal">
            {t("A los borradores con productos quítales los productos para pasarlos a la lista nueva, o crea otra cotización; las presentadas y los pedidos no cambian.")}
          </p>
        </Alert>
      )}

      <ActivityJump />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <div className="card">
            <Tabs basePath={path} active={tab} tabs={[
              { key: "relacionado", label: "Relacionado" }, { key: "equipo", label: "Equipo" }, { key: "documentos", label: "Documentos" },
              ...(showSap ? [{ key: "sap", label: "SAP" }] : []),
              { key: "detalles", label: "Detalles" }, { key: "historial", label: "Historial de cambios" },
            ]} />
          </div>
          {tab === "historial" ? (
            <FieldHistory object="accounts" recordId={id} />
          ) : tab === "sap" ? (
            <SapAccountCard cardCode={(row.sap_card_code as string | null) ?? null} />
          ) : tab === "documentos" ? (
            <DocumentsCard object="accounts" recordId={id} recordName={String(row.name)} userId={user.id} />
          ) : tab === "equipo" ? (
            <TeamCard object="accounts" recordId={id} ownerId={(row.owner_id as string | null) ?? null}
              ownerName={owner?.full_name || owner?.email || null} />
          ) : tab === "detalles" ? (
            <DetailSections def={def} row={row} />
          ) : (
            <>
              <RelatedList def={oppsDef} title="Oportunidades" rows={oppRows}
                columns={["name", "stage_id", "amount", "close_date", "owner_id"]}
                newHref={can(user.access, "opportunities", "create") ? `/oportunidades/nueva?account=${id}` : undefined} />
              <RelatedList def={contactsDef} title="Contactos" rows={(contacts.data ?? []) as unknown as Row[]}
                columns={["full_name", "title", "email", "mobile"]}
                newHref={can(user.access, "contacts", "create") ? `/contactos/nuevo?account=${id}` : undefined} />
              <RelatedList def={quotesDef} title="Cotizaciones" rows={(quotes.data ?? []) as unknown as Row[]}
                columns={["quote_number", "name", "status", "grand_total", "expiration_date"]} />
              {can(user.access, "orders", "read") && (
                <RelatedList def={ordersDef} title="Pedidos" rows={(orders.data ?? []) as unknown as Row[]}
                  columns={["order_number", "name", "status", "order_date", "requested_delivery_date", "grand_total"]}
                  newHref={can(user.access, "orders", "create") ? `/pedidos/nuevo?account=${id}` : undefined} />
              )}
              <RelatedList def={casesDef} title="Casos" rows={(cases.data ?? []) as unknown as Row[]}
                columns={["case_number", "subject", "status", "priority", "created_at"]}
                newHref={can(user.access, "cases", "create") ? `/casos/nuevo?account=${id}` : undefined} />
              {(children.data?.length ?? 0) > 0 && (
                <RelatedList def={def} title="Cuentas relacionadas" rows={(children.data ?? []) as unknown as Row[]}
                  columns={["name", "account_type", "billing_city", "owner_id"]} />
              )}
            </>
          )}
        </div>
        <ActivityPanel related={{ account_id: id }} activities={activities} users={users} userId={user.id}
          canCreate={can(user.access, "activities", "create")} />
      </div>
    </div>
  );
}
