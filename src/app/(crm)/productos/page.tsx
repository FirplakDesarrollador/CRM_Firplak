import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck, Percent, Tags } from "lucide-react";
import { ObjectListPage } from "@/components/records/ObjectListPage";
import { decodeFilters } from "@/lib/records/filters";
import { requireUser } from "@/lib/session";
import { CartButton } from "@/components/products/Cart";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Productos" };

/** Filtro de un clic: productos con disponible real (En inventario − Comprometido en PT-01) mayor que cero. */
const IN_STOCK = { field: "available_qty", op: "gt", value: "0" } as const;

export default async function ProductsPage({ searchParams }: PageProps<"/productos">) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const raw = typeof sp.f === "string" ? sp.f : "";
  const filters = decodeFilters(raw);
  const active = filters.some((f) => f.field === IN_STOCK.field && f.op === IN_STOCK.op);
  // El botón agrega o quita ese filtro y conserva lo demás (vista, búsqueda, otros filtros, columnas).
  const next = active ? filters.filter((f) => !(f.field === IN_STOCK.field && f.op === IN_STOCK.op)) : [...filters, IN_STOCK];
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "f" && k !== "page" ? [[k, v]] : [])));
  if (next.length) qs.set("f", JSON.stringify(next));
  const href = qs.size ? `/productos?${qs.toString()}` : "/productos";
  // El ajuste masivo de precios actúa sobre lo que muestra la lista: lleva su vista, búsqueda y filtros.
  const adjustQs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && ["q", "f", "view"].includes(k) ? [[k, v]] : [])));
  const adjustHref = adjustQs.size ? `/productos/ajustar-precios?${adjustQs.toString()}` : "/productos/ajustar-precios";
  return (
    <>
    <CartButton userId={user.id} />
    <ObjectListPage object="products" user={user} searchParams={sp} newHref="/productos/nuevo"
      newLabel="Nuevo producto" defaultViewName="Todos los productos"
      extraActions={
        <>
          <Link href={href} className={`btn ${active ? "btn-primary" : ""}`} aria-pressed={active}
            title="En inventario menos comprometido en PT-01, mayor que cero">
            <PackageCheck size={16} /> <Tr>Con disponible</Tr>
          </Link>
          {user.access.isAdmin && <Link href={adjustHref} className="btn"><Percent size={16} /> <Tr>Ajustar precios</Tr></Link>}
          <Link href="/productos/listas" className="btn"><Tags size={16} /> <Tr>Listas de precios</Tr></Link>
        </>
      } />
    </>
  );
}
