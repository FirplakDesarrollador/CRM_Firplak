import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getChannels, getPipelines } from "@/lib/records/data";
import { canSystem } from "@/lib/permissions";
import { FORECAST_CATEGORIES } from "@/lib/objects/picklists";
import { requireUser } from "@/lib/session";
import { VALUES_EN } from "@/lib/i18n/values-en";
import { deletePipeline, deleteStage, duplicatePipeline, savePipeline, saveStage } from "../actions";

import { Tr } from "@/components/ui/Tr";
import { Opt } from "@/components/ui/Opt";
export const metadata: Metadata = { title: "Pipelines y etapas" };

const CATEGORIES = { open: "Abierta", won: "Ganada", lost: "Perdida" };

/** Canal de venta cuyas oportunidades van al pipeline. */
function ChannelSelect({ id, value, channels }: { id: string; value: string | null; channels: string[] }) {
  return (
    <select id={id} name="channel" className="select" defaultValue={value ?? ""}>
      <Opt value="">— Sin canal —</Opt>
      {channels.map((c) => <option key={c} value={c}>{c}</option>)}
      {value && !channels.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

/** Mercado del pipeline: sus oportunidades son de cuentas de ese mercado y su canal. */
function MarketSelect({ id, value }: { id: string; value: string }) {
  return (
    <select id={id} name="market" className="select" defaultValue={value}>
      <Opt value="Nacional">Nacional</Opt>
      <Opt value="Internacional">Internacional</Opt>
    </select>
  );
}

// Cuándo pasa la oportunidad a esta etapa (no son estados de la cotización).
const ROLES = { "": "—", propuesta: "Al presentar la primera cotización", negociacion: "Al aceptarse una parte (quedan otras abiertas)" };

function StageFields({ stage }: { stage?: { id: string; name: string; name_en?: string | null; probability: number; category: string; forecast_category: string; color: string; sort_order: number; stage_role?: string | null } }) {
  const id = stage?.id ?? "new";
  return (
    <>
      <div className="w-16">
        <label className="label" htmlFor={`so-${id}`}><Tr>Orden</Tr></label>
        <input id={`so-${id}`} name="sort_order" type="number" className="input" defaultValue={stage?.sort_order ?? 10} />
      </div>
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor={`sn-${id}`}><Tr>Etapa</Tr></label>
        <input id={`sn-${id}`} name="name" className="input font-semibold" defaultValue={stage?.name} required />
      </div>
      <div className="min-w-36 flex-1">
        <label className="label" htmlFor={`se-${id}`}><Tr>En inglés</Tr></label>
        <input id={`se-${id}`} name="name_en" className="input" defaultValue={stage?.name_en ?? ""}
          placeholder={(stage && VALUES_EN[stage.name]) || "English name"} />
      </div>
      <div className="w-24">
        <label className="label" htmlFor={`sp-${id}`}><Tr>Prob. %</Tr></label>
        <input id={`sp-${id}`} name="probability" type="number" min={0} max={100} className="input" defaultValue={stage?.probability ?? 20} />
      </div>
      <div className="w-32">
        <label className="label" htmlFor={`sc-${id}`}><Tr>Tipo</Tr></label>
        <select id={`sc-${id}`} name="category" className="select" defaultValue={stage?.category ?? "open"}>
          {Object.entries(CATEGORIES).map(([k, v]) => <Opt key={k} value={k}>{v}</Opt>)}
        </select>
      </div>
      <div className="w-36">
        <label className="label" htmlFor={`sf-${id}`}><Tr>Pronóstico</Tr></label>
        <select id={`sf-${id}`} name="forecast_category" className="select" defaultValue={stage?.forecast_category ?? "pipeline"}>
          {Object.entries(FORECAST_CATEGORIES).map(([k, v]) => <Opt key={k} value={k}>{v}</Opt>)}
        </select>
      </div>
      <div className="w-full max-w-sm sm:w-[22rem]">
        <label className="label" htmlFor={`sr-${id}`}><Tr>Avanza con cotización</Tr></label>
        <select id={`sr-${id}`} name="stage_role" className="select" defaultValue={stage?.stage_role ?? ""}>
          {Object.entries(ROLES).map(([k, v]) => <Opt key={k} value={k}>{v}</Opt>)}
        </select>
      </div>
      <div className="w-16">
        <label className="label" htmlFor={`sk-${id}`}><Tr>Color</Tr></label>
        <input id={`sk-${id}`} name="color" type="color" className="input p-1" defaultValue={stage?.color ?? "#4a7693"} />
      </div>
    </>
  );
}

export default async function PipelinesPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const [pipelines, channels] = await Promise.all([getPipelines(), getChannels()]);

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Pipelines y etapas</Tr></h1>
        <p className="max-w-[75ch] text-sm text-muted"><Tr>Cada pipeline necesita al menos una etapa abierta, una ganada y una perdida. La probabilidad y el pronóstico se aplican al mover una oportunidad.</Tr></p>
        <p className="max-w-[75ch] text-sm text-muted"><Tr>«Avanza con cotización» marca a qué etapa pasa sola la oportunidad (solo hacia adelante): «Al presentar la primera cotización», cuando una cotización queda Presentada; «Al aceptarse una parte (quedan otras abiertas)», cuando el cliente acepta una cotización y la oportunidad tiene otras abiertas. Cuando ya no quedan partes abiertas y alguna fue aceptada, pasa a la etapa ganada.</Tr></p>
        <p className="max-w-[75ch] text-sm text-muted"><Tr>Cada pipeline es de un mercado (Nacional o Internacional) y de un canal de venta: las oportunidades de una cuenta van al pipeline de su Mercado y su Canal, y en Indicadores cada uno tiene su embudo. Si falta el pipeline de un mercado y canal, sus oportunidades no se pueden crear hasta crearlo; «Duplicar» copia un pipeline con sus etapas a otro mercado.</Tr></p>
      </div>
      <section className="card">
        <div className="card-header"><h2 className="card-title"><Tr>Nuevo pipeline</Tr></h2></div>
        <ActionForm action={savePipeline.bind(null, null)} resetOnSuccess className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1"><label className="label" htmlFor="np-name"><Tr>Nombre</Tr></label><input id="np-name" name="name" className="input" required /></div>
          <div className="min-w-40 flex-1"><label className="label" htmlFor="np-en"><Tr>En inglés (opcional)</Tr></label><input id="np-en" name="name_en" className="input" placeholder="English name" /></div>
          <div className="min-w-48 flex-1"><label className="label" htmlFor="np-desc"><Tr>Descripción</Tr></label><input id="np-desc" name="description" className="input" /></div>
          <div className="w-48"><label className="label" htmlFor="np-channel"><Tr>Canal de venta</Tr></label><ChannelSelect id="np-channel" value={null} channels={channels} /></div>
          <div className="w-40"><label className="label" htmlFor="np-market"><Tr>Mercado</Tr></label><MarketSelect id="np-market" value="Nacional" /></div>
          <SubmitButton pendingText="Creando…"><Tr>Crear pipeline</Tr></SubmitButton>
        </ActionForm>
      </section>

      {pipelines.map((p) => (
        <section key={p.id} className="card">
          <ActionForm action={savePipeline.bind(null, p.id)} className="card-header flex-wrap">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <label className="label" htmlFor={`pn-${p.id}`}><Tr>Pipeline</Tr></label>
                <input id={`pn-${p.id}`} name="name" className="input font-semibold" defaultValue={p.name} />
              </div>
              <div className="min-w-40 flex-1">
                <label className="label" htmlFor={`pe-${p.id}`}><Tr>En inglés</Tr></label>
                <input id={`pe-${p.id}`} name="name_en" className="input" defaultValue={p.name_en ?? ""}
                  placeholder={VALUES_EN[p.name] || "English name"} />
              </div>
              <div className="min-w-48 flex-1">
                <label className="label" htmlFor={`pd-${p.id}`}><Tr>Descripción</Tr></label>
                <input id={`pd-${p.id}`} name="description" className="input" defaultValue={p.description ?? ""} />
              </div>
              <div className="w-48">
                <label className="label" htmlFor={`pc-${p.id}`}><Tr>Canal de venta</Tr></label>
                <ChannelSelect id={`pc-${p.id}`} value={p.channel} channels={channels} />
              </div>
              <div className="w-40">
                <label className="label" htmlFor={`pm-${p.id}`}><Tr>Mercado</Tr></label>
                <MarketSelect id={`pm-${p.id}`} value={p.market} />
              </div>
              <label className="flex items-center gap-1.5 pb-2 text-sm font-semibold">
                <input type="checkbox" name="is_default" defaultChecked={p.is_default} className="accent-[var(--brand)]" /> <Tr>Por defecto</Tr>
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-sm font-semibold">
                <input type="checkbox" name="is_active" defaultChecked={p.is_active} className="accent-[var(--brand)]" /> <Tr>Activo</Tr>
              </label>
              <SubmitButton className="btn btn-sm mb-1" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
            </div>
          </ActionForm>
          <ul className="divide-y divide-[var(--border)]">
            {p.stages.map((s) => (
              <li key={s.id} className="flex flex-wrap items-end gap-2 px-4 py-3">
                <span className="mb-3 h-3 w-3 flex-none rounded-full" style={{ background: s.color }} />
                <ActionForm action={saveStage.bind(null, p.id, s.id)} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                  <StageFields stage={s} />
                  <SubmitButton className="btn btn-sm mb-1" pendingText="…"><Tr>Guardar</Tr></SubmitButton>
                </ActionForm>
                <ActionForm action={deleteStage.bind(null, s.id)} className="mb-1 flex flex-col items-end">
                  <ConfirmSubmit message={`¿Eliminar la etapa “${s.name}”?`}><Trash2 size={14} /><span className="sr-only"><Tr>Eliminar</Tr></span></ConfirmSubmit>
                </ActionForm>
              </li>
            ))}
            <li className="bg-surface-2 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"><Tr>Agregar etapa</Tr></p>
              <ActionForm action={saveStage.bind(null, p.id, null)} resetOnSuccess className="flex flex-wrap items-end gap-2">
                <StageFields />
                <SubmitButton className="btn btn-sm btn-primary mb-1" pendingText="…"><Tr>Agregar</Tr></SubmitButton>
              </ActionForm>
            </li>
          </ul>
          <ActionForm action={duplicatePipeline.bind(null, p.id)} resetOnSuccess className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3">
            <p className="w-full text-xs font-semibold uppercase tracking-wide text-muted"><Tr>Duplicar con sus etapas</Tr></p>
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor={`dn-${p.id}`}><Tr>Nombre del pipeline nuevo</Tr></label>
              <input id={`dn-${p.id}`} name="name" className="input" required
                defaultValue={`${p.name} ${p.market === "Internacional" ? "nacional" : "internacional"}`} />
            </div>
            <div className="w-40">
              <label className="label" htmlFor={`dm-${p.id}`}><Tr>Mercado</Tr></label>
              <MarketSelect id={`dm-${p.id}`} value={p.market === "Internacional" ? "Nacional" : "Internacional"} />
            </div>
            <SubmitButton className="btn btn-sm mb-1" pendingText="…"><Tr>Duplicar</Tr></SubmitButton>
          </ActionForm>
          {!p.is_default && (
            <ActionForm action={deletePipeline.bind(null, p.id)} className="flex flex-col items-end gap-1 border-t border-line px-4 py-3">
              <ConfirmSubmit message={`¿Eliminar el pipeline “${p.name}” y sus etapas?`}><Trash2 size={14} /> <Tr>Eliminar pipeline</Tr></ConfirmSubmit>
            </ActionForm>
          )}
        </section>
      ))}
    </>
  );
}
