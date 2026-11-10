import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { getObjectDef, untypedClient } from "@/lib/records/data";
import { insertActivity } from "@/lib/records/activities";
import { persistRecord } from "@/lib/records/persist";
import type { FormState } from "@/lib/records/form";

/**
 * Recibe un registro creado sin señal (un cliente o una actividad) y lo guarda con las mismas comprobaciones
 * del CRM. El id lo trae el dispositivo: si el registro ya existe (un reenvío tras perder la respuesta), se
 * responde «enviado» sin crear otro.
 *
 * El resultado va en el cuerpo: `sent` (guardado) o `rejected` (el CRM no lo aceptó, con el motivo). Un 4xx o
 * 5xx es un problema del envío, no del registro: el dispositivo lo conserva.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = { account: "accounts", activity: "activities" } as const;
const NO_STORE = { "Cache-Control": "no-store" };

type Body = { id?: unknown; userId?: unknown; kind?: unknown; values?: unknown; ignoreDuplicates?: unknown };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "No autenticado" }, 401);

  const body = (await request.json().catch(() => null)) as Body | null;
  const id = typeof body?.id === "string" ? body.id.toLowerCase() : "";
  const kind = typeof body?.kind === "string" && body.kind in KINDS ? (body.kind as keyof typeof KINDS) : null;
  const raw = body?.values;
  if (!UUID.test(id) || !kind || !raw || typeof raw !== "object" || Array.isArray(raw)) {
    return json({ error: "Envío no válido" }, 400);
  }
  // Lo que escribió otra persona en este dispositivo no se guarda a nombre de quien tiene la sesión.
  if (body?.userId !== user.id) return json({ status: "other-user" }, 403);

  const objectKey = KINDS[kind];
  const db = await untypedClient();
  const exists = async () => Boolean((await db.from(objectKey).select("id").eq("id", id).maybeSingle()).data);
  if (await exists()) return json({ status: "sent", id });

  const formData = new FormData();
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value !== "") formData.set(name, value);
  }
  // Quien lo creó es quien lo envía: el propietario no se elige desde el dispositivo.
  formData.delete("owner_id");
  formData.delete("id");

  const def = await getObjectDef(objectKey);
  let state: FormState;
  if (kind === "account") {
    const result = await persistRecord("accounts", null, formData, user, { ignoreDuplicates: body?.ignoreDuplicates === true, newId: id });
    if (result.ok) return sent(id);
    state = result.state;
  } else {
    const result = await insertActivity(formData, user, id);
    if (result.ok) return sent(id);
    state = result.state;
  }

  // El primer intento sí guardó y solo se perdió la respuesta.
  if (await exists()) return sent(id);

  const errors = Object.entries(state.errors ?? {}).map(([field, message]) => ({
    field,
    label: def.fields.find((f) => f.name === field)?.label ?? field,
    message,
  }));
  return json({
    status: "rejected",
    reason: state.message ?? (errors.length ? "Revisa los campos marcados." : "El CRM no aceptó el registro."),
    errors: errors.length ? errors : undefined,
    duplicates: state.duplicates?.map((d) => ({ id: d.id, label: d.label })),
  });
}

function sent(id: string) {
  revalidatePath("/", "layout");
  return json({ status: "sent", id });
}
