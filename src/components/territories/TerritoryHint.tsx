import { Alert } from "@/components/ui/Alert";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";

/**
 * Sugerencia de responsable según los territorios (Configuración → Territorios): si el cliente o prospecto está a
 * cargo de alguien a quien no le corresponde su canal, mercado y zona o país, dice a quién sí. No cambia nada: el
 * responsable se cambia editando el registro.
 */
export async function TerritoryHint({ channel, market, zone, department, country, ownerId }: {
  channel: string | null; market: string | null; zone: string | null; department: string | null; country: string | null; ownerId: string | null;
}) {
  if (!channel) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("territory_owners", {
    p_channel: channel, p_market: market ?? "Nacional", p_zone: zone ?? "", p_department: department ?? "", p_country: country ?? "",
  });
  const owners = data ?? [];
  if (owners.length === 0 || owners.some((o) => o.user_id === ownerId)) return null;
  return (
    <div className="border-t border-line px-5 py-3">
      <Alert tone="info">
        <Tr>Según los territorios, le corresponde a</Tr> {owners.map((o) => o.full_name).join(", ")}.
      </Alert>
    </div>
  );
}
