import Link from "next/link";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { formatNumber } from "@/lib/format";

type Row = { id: string; productId: string | null; name: string; code: string | null; quantity: number; available: number | null };

/**
 * Disponible de un kit: no tiene inventario propio, así que se arma con el disponible real de sus componentes
 * (En inventario − Comprometido en PT-01). El componente que menos alcanza decide cuántos kits completos salen.
 */
export function KitAvailability({ available, syncedAt, components }: { available: number | null; syncedAt: string | null; components: Row[] }) {
  const reach = (c: Row) => (c.available === null ? null : Math.max(0, Math.floor(c.available / c.quantity)));
  const known = components.map(reach).filter((n): n is number => n !== null);
  const limit = known.length ? Math.min(...known) : null;
  return (
    <section className="card overflow-hidden">
      <div className="card-header flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="card-title"><Tr>Disponible del kit</Tr></h2>
          <p className="text-xs text-muted">
            <Tr>Kits completos que salen con el disponible real de sus componentes en PT-01.</Tr>
            {syncedAt && <> · <Tr>SAP al</Tr> <Fmt datetime={syncedAt} /></>}
          </p>
        </div>
        <p className={`kpi-value text-[1.9rem] ${available === null ? "text-muted" : available > 0 ? "text-success" : "text-danger"}`} data-testid="kit-disponible">
          {available === null ? "—" : formatNumber(available)}
        </p>
      </div>
      {components.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted"><Tr>Este kit no tiene componentes: agrégalos en la pestaña Precios.</Tr></p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th><Tr>Componente</Tr></th>
                <th className="text-right"><Tr>Por kit</Tr></th>
                <th className="text-right"><Tr>Disponible PT-01</Tr></th>
                <th className="text-right"><Tr>Alcanza para</Tr></th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => {
                const n = reach(c);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.productId ? <Link href={`/productos/${c.productId}?tab=sap`} className="link">{c.name}</Link> : c.name}
                      {c.code && <p className="text-xs text-muted">{c.code}</p>}
                    </td>
                    <td className="num text-right">{formatNumber(c.quantity)}</td>
                    <td className={`num text-right ${c.available !== null && c.available <= 0 ? "text-danger" : ""}`}>{c.available === null ? <span className="text-muted"><Tr>Sin dato de SAP</Tr></span> : formatNumber(c.available)}</td>
                    <td className="num text-right font-medium">
                      {n === null ? "—" : <>{formatNumber(n)} <span className="font-normal text-muted"><Tr>kits</Tr></span></>}
                      {n !== null && n === limit && components.length > 1 && <span className="badge badge-warning ml-2"><Tr>Limita</Tr></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {available === null && components.length > 0 && (
        <p className="border-t border-line px-4 py-3 text-sm text-muted"><Tr>Falta el dato de SAP de algún componente: el disponible del kit se calcula cuando el agente lo traiga.</Tr></p>
      )}
    </section>
  );
}
