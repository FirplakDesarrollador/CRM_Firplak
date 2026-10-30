import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { getPipelines, getRecordAccess, getUsers } from "@/lib/records/data";
import { addDaysISO, todayISO } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { ConvertForm } from "./ConvertForm";

export const metadata: Metadata = { title: "Convertir prospecto" };

export default async function ConvertLeadPage({ params }: PageProps<"/prospectos/[id]/convertir">) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, full_name, company, owner_id, is_converted").eq("id", id).maybeSingle();
  if (!lead) notFound();
  if (lead.is_converted) redirect(`/prospectos/${id}`);
  const { canEdit } = await getRecordAccess("leads", lead.owner_id);
  if (!canEdit) redirect(`/prospectos/${id}`);

  const [pipelines, users, { data: matches }] = await Promise.all([
    getPipelines(),
    getUsers(),
    supabase.from("accounts").select("id, name, billing_city").ilike("name", `%${lead.company.replace(/[%_,()]/g, " ").slice(0, 40)}%`).limit(5),
  ]);
  const pipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/prospectos/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-ink">
        <ChevronLeft size={16} /> Volver al prospecto
      </Link>
      <div className="flex items-center gap-3">
        <ObjectIcon object="leads" />
        <div>
          <p className="eyebrow">Convertir prospecto</p>
          <h1 className="text-xl font-medium">{lead.full_name} · {lead.company}</h1>
        </div>
      </div>
      <ConvertForm
        leadId={id}
        company={lead.company}
        contactName={lead.full_name ?? lead.company}
        ownerId={lead.owner_id ?? user.id}
        matches={(matches ?? []).map((m) => ({ id: m.id, name: m.name, city: m.billing_city }))}
        pipelines={pipelines.filter((p) => p.is_active).map((p) => ({
          id: p.id, name: p.name, stages: p.stages.filter((s) => s.category === "open").map((s) => ({ id: s.id, name: s.name })),
        }))}
        defaultStage={pipeline?.stages.find((s) => s.category === "open")?.id ?? ""}
        defaultClose={addDaysISO(todayISO(), 30)}
        users={users.filter((u) => u.is_active).map((u) => ({ id: u.id, name: u.full_name }))}
      />
    </div>
  );
}
