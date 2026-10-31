import "server-only";

// Cliente de solo lectura del Service Layer de SAP Business One (API REST/OData).
// Credenciales solo de servidor: SAP_SL_URL (p. ej. https://sap.firplak.com:50000/b1s/v1),
// SAP_COMPANY_DB, SAP_USER y SAP_PASSWORD (usuario técnico con permisos de solo lectura).
const sap = {
  url: (process.env.SAP_SL_URL ?? "").replace(/\/$/, ""),
  companyDb: process.env.SAP_COMPANY_DB ?? "",
  user: process.env.SAP_USER ?? "",
  password: process.env.SAP_PASSWORD ?? "",
};

export const sapConfigured = () => Boolean(sap.url && sap.companyDb && sap.user && sap.password);
export const sapCompany = () => sap.companyDb;

// Sesión compartida del servidor (B1SESSION y ROUTEID); se renueva al vencer o con un 401.
let session: { cookie: string; expiresAt: number } | null = null;

async function login() {
  const res = await fetch(`${sap.url}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ CompanyDB: sap.companyDb, UserName: sap.user, Password: sap.password }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { SessionId?: string; SessionTimeout?: number; error?: { message?: { value?: string } } };
  if (!res.ok || !json.SessionId) throw new Error(json.error?.message?.value ?? `SAP no aceptó el inicio de sesión (${res.status})`);
  const route = (res.headers.get("set-cookie") ?? "").match(/ROUTEID=([^;]+)/)?.[1];
  const minutes = json.SessionTimeout ?? 30;
  session = { cookie: `B1SESSION=${json.SessionId}${route ? `; ROUTEID=${route}` : ""}`, expiresAt: Date.now() + (minutes - 2) * 60_000 };
  return session.cookie;
}

export class SapError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** GET al Service Layer con la sesión vigente. */
export async function sapGet<T>(path: string, retry = true): Promise<T> {
  if (!sapConfigured()) throw new SapError(503, "SAP Business One no está configurado");
  const cookie = session && session.expiresAt > Date.now() ? session.cookie : await login();
  const res = await fetch(`${sap.url}${path}`, { headers: { Cookie: cookie, Prefer: "odata.maxpagesize=50" }, cache: "no-store" });
  if (res.status === 401 && retry) {
    session = null;
    return sapGet<T>(path, false);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new SapError(res.status, (json as { error?: { message?: { value?: string } } }).error?.message?.value ?? `SAP respondió ${res.status}`);
  return json as T;
}

/** Literal OData seguro para un código (comillas simples duplicadas). */
export const odataString = (value: string) => `'${value.replace(/'/g, "''")}'`;
