import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getObject, isObjectKey } from "@/lib/objects";
import { untypedClient } from "@/lib/records/data";

/** Búsqueda para campos de relación: /api/lookup?object=accounts&q=casa&account=<id> */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const object = params.get("object") ?? "";
  if (!isObjectKey(object)) return NextResponse.json({ error: "Objeto no válido" }, { status: 400 });
  const def = getObject(object);
  const term = (params.get("q") ?? "").replace(/[,()"'\\%*]/g, " ").trim();
  const account = params.get("account");

  const db = await untypedClient();
  const subtitle: Record<string, string> = {
    accounts: "account_type, billing_city",
    contacts: "title, email",
    opportunities: "close_date, amount",
    activities: "activity_type, due_date",
    leads: "company, status",
    products: "product_code, family",
    quotes: "quote_number, status",
    orders: "order_number, status",
    cases: "case_number, status",
    campaigns: "campaign_type, status",
  };
  let query = db.from(def.table).select(`id, ${def.nameField}, ${subtitle[object]}`).limit(10).order(def.nameField);
  if (term) query = query.ilike(def.nameField, `%${term}%`);
  if (object === "products") query = query.eq("is_active", true);
  if (account && /^[0-9a-f-]{36}$/i.test(account) && (object === "contacts" || object === "opportunities")) {
    query = query.eq("account_id", account);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    label: String(r[def.nameField] ?? ""),
    sub: subtitle[object].split(", ").map((k) => r[k]).filter(Boolean).join(" · "),
  }));
  return NextResponse.json({ results });
}
