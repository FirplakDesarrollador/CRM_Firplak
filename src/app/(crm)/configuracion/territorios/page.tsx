import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { Val } from "@/components/ui/Val";
import { canSystem } from "@/lib/permissions";
import { getChannels, getGeo, getObjectDef, getUsers } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { deleteTerritory, deleteZonePlace, saveTerritory, saveZonePlace } from "../actions";

export const metadata: Metadata = { title: "Territorios" };

type Territory = { id: string; user_id: string; channels: string[]; market: string; zone: string | null; departments: string[]; countries: string[]; notes: string | null };
type ZonePlace = { id: string; zone: string; department: string; city: string | null };

/** Dónde atiende: la zona con sus departamentos, o los países. */
function coverage(t: Territory) {
  if (t.market === "Internacional") return t.countries.length ? t.countries.join(", ") : "Todo el exterior";
  const zone = t.zone ?? "Todo el país";
  return t.departments.length ? `${zone}: ${t.departments.join(", ")}` : zone;
}

export default async function TerritoriesPage() {
  const me = await requireUser();
  if (!canSystem(me.access, "manage_users")) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data: rows }, { data: places }, users, channels, geo, accounts] = await Promise.all([
    supabase.from("territories").select("id, user_id, channels, market, zone, departments, countries, notes").order("created_at"),
    supabase.from("zone_places").select("id, zone, department, city").order("zone").order("department").order("city"),
    getUsers(),
    getChannels(),
    getGeo(),
    getObjectDef("accounts"),
  ]);
  const territories = (rows ?? []) as Territory[];
  const zonePlaces = (places ?? []) as ZonePlace[];
  const zones = accounts.fields.find((f) => f.name === "zone")?.options ?? [];
  const active = users.filter((u) => u.is_active);
  const byUser = active
    .map((u) => ({ user: u, rows: territories.filter((t) => t.user_id === u.id) }))
    .filter((g) => g.rows.length > 0);
  const byZone = zones.map((zone) => ({ zone, rows: zonePlaces.filter((p) => p.zone === zone) }));
  const otherZones = zonePlaces.filter((p) => !zones.includes(p.zone));

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Territorios</Tr></h1>
        <p className="max-w-[80ch] text-sm text-muted">
          <Tr>Qué canal, mercado y zona o países atiende cada asesor. Con eso el CRM sugiere el responsable de un cliente o prospecto y no deja que un asesor cree clientes fuera de lo suyo. Quien no tiene territorios no tiene esa restricción.</Tr>
        </p>
      </div>

      <section className="card" aria-labelledby="territorio-nuevo">
        <div className="card-header"><h2 id="territorio-nuevo" className="card-title"><Tr>Agregar territorio</Tr></h2></div>
        <ActionForm action={saveTerritory} resetOnSuccess className="grid gap-3 p-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="t-user"><Tr>Asesor</Tr></label>
            <select id="t-user" name="user_id" className="select" required defaultValue="">
              <option value="" disabled>—</option>
              {active.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <fieldset>
            <legend className="label"><Tr>Canales</Tr></legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
              {channels.map((c) => (
                <label key={c} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="channels" value={c} className="accent-[var(--brand)]" /> <Val>{c}</Val>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="t-market"><Tr>Mercado</Tr></label>
            <select id="t-market" name="market" className="select" defaultValue="Nacional">
              <option value="Nacional">Nacional</option>
              <option value="Internacional">Internacional</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="t-zone"><Tr>Zona (Nacional)</Tr></label>
            <select id="t-zone" name="zone" className="select" defaultValue="">
              <option value="">Todo el país</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="t-deps"><Tr>Solo estos departamentos de la zona (opcional)</Tr></label>
            <input id="t-deps" name="departments" className="input" list="lista-departamentos" placeholder="Meta, Boyacá, Casanare" />
            <p className="help"><Tr>Separados por coma. Vacío: toda la zona.</Tr></p>
          </div>
          <div>
            <label className="label" htmlFor="t-countries"><Tr>Países (Internacional)</Tr></label>
            <input id="t-countries" name="countries" className="input" placeholder="Ecuador, Perú" />
            <p className="help"><Tr>Separados por coma, como aparecen en la lista de países. Vacío: todo el exterior.</Tr></p>
          </div>
          <datalist id="lista-departamentos">{Object.keys(geo.departments).map((d) => <option key={d} value={d} />)}</datalist>
          <div className="md:col-span-2 flex justify-end"><SubmitButton pendingText="Agregando…"><Tr>Agregar territorio</Tr></SubmitButton></div>
        </ActionForm>
      </section>

      <section className="card overflow-hidden" aria-labelledby="territorios-por-asesor">
        <div className="card-header"><h2 id="territorios-por-asesor" className="card-title"><Tr>Territorios por asesor</Tr> <span className="badge">{territories.length}</span></h2></div>
        {byUser.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted"><Tr>Todavía no hay territorios. Mientras no los haya, nadie tiene restricción para crear clientes.</Tr></p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {byUser.map(({ user, rows: mine }) => (
              <li key={user.id} className="px-4 py-3">
                <p className="font-semibold">{user.full_name}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {mine.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="badge"><Val>{t.market}</Val></span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{t.channels.join(" + ")}</span> · {coverage(t)}
                      </span>
                      <ActionForm action={deleteTerritory.bind(null, t.id)}>
                        <ConfirmSubmit message={`¿Quitar este territorio de ${user.full_name}?`}>
                          <Trash2 size={14} /><span className="sr-only"><Tr>Quitar</Tr> {t.channels.join(" + ")} · {coverage(t)}</span>
                        </ConfirmSubmit>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden" aria-labelledby="zonas-por-lugar">
        <div className="card-header"><h2 id="zonas-por-lugar" className="card-title"><Tr>Zonas por departamento y ciudad</Tr></h2></div>
        <p className="px-4 pt-3 text-sm text-muted">
          <Tr>Con esto el CRM pone la zona de un cliente según su dirección. Una ciudad puede ir en una zona distinta a la de su departamento.</Tr>
        </p>
        <ul className="divide-y divide-[var(--border)]">
          {[...byZone, ...(otherZones.length ? [{ zone: "Otras", rows: otherZones }] : [])].map(({ zone, rows: mine }) => (
            <li key={zone} className="px-4 py-3">
              <p className="font-semibold">{zone} <span className="badge">{mine.length}</span></p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {mine.length === 0 && <span className="text-sm text-muted"><Tr>Sin departamentos.</Tr></span>}
                {mine.map((p) => (
                  <span key={p.id} className="badge inline-flex items-center gap-1">
                    {p.city ? `${p.city} (${p.department})` : p.department}
                    <ActionForm action={deleteZonePlace.bind(null, p.id)} className="inline-flex">
                      <ConfirmSubmit message={`¿Quitar ${p.city ?? p.department} de la zona ${p.zone}?`} className="inline-flex">
                        <Trash2 size={12} /><span className="sr-only"><Tr>Quitar</Tr> {p.city ?? p.department}</span>
                      </ConfirmSubmit>
                    </ActionForm>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <ActionForm action={saveZonePlace} resetOnSuccess className="grid gap-3 border-t border-line bg-surface-2 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="zp-zone"><Tr>Zona</Tr></label>
            <select id="zp-zone" name="zone" className="select" required defaultValue="">
              <option value="" disabled>—</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="zp-dep"><Tr>Departamento</Tr></label>
            <input id="zp-dep" name="department" className="input" list="lista-departamentos" required />
          </div>
          <div>
            <label className="label" htmlFor="zp-city"><Tr>Ciudad (opcional)</Tr></label>
            <input id="zp-city" name="city" className="input" />
          </div>
          <SubmitButton className="btn" pendingText="…"><Tr>Asignar a la zona</Tr></SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
