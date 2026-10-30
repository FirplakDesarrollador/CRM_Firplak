import "server-only";
import { siteUrl } from "@/lib/env";

// Microsoft 365 (Entra ID + Microsoft Graph). Las direcciones de inicio de sesión y de Graph
// se pueden cambiar solo para el simulador del modo demo.
export const ms365 = {
  tenant: process.env.MS365_TENANT_ID ?? "",
  clientId: process.env.MS365_CLIENT_ID ?? "",
  clientSecret: process.env.MS365_CLIENT_SECRET ?? "",
  encryptionKey: process.env.MS365_ENCRYPTION_KEY ?? "",
  loginUrl: (process.env.MS365_LOGIN_URL ?? "https://login.microsoftonline.com").replace(/\/$/, ""),
  graphUrl: (process.env.MS365_GRAPH_URL ?? "https://graph.microsoft.com/v1.0").replace(/\/$/, ""),
};

/** Permisos delegados que pide el CRM (la persona los acepta al conectar su cuenta). */
export const MS365_SCOPES = [
  "openid", "profile", "email", "offline_access", "User.Read", "Calendars.ReadWrite", "Mail.Read", "Mail.Send",
  // Fase 21: Planner y documentos de SharePoint.
  "Tasks.ReadWrite", "Files.ReadWrite.All", "Sites.Read.All",
];

export const redirectUri = () => `${siteUrl}/api/ms365/callback`;

export function ms365Configured() {
  return Boolean(ms365.tenant && ms365.clientId && ms365.clientSecret && ms365.encryptionKey);
}

export type Ms365Settings = {
  calendar_push: boolean; calendar_pull: boolean; mail_pull: boolean; send_via_outlook: boolean;
  /** Planner: plan y depósito donde se crean las tareas del CRM (vacío = desactivado). */
  planner_plan_id?: string; planner_plan_name?: string; planner_bucket_id?: string; planner_bucket_name?: string;
};
export const DEFAULT_SETTINGS: Ms365Settings = { calendar_push: true, calendar_pull: true, mail_pull: true, send_via_outlook: true };

/** ¿La conexión incluye un permiso? (las conectadas antes de la Fase 21 deben volver a conectar). */
export const hasScope = (granted: string | null | undefined, scope: string) =>
  (granted ?? "").toLowerCase().split(/\s+/).some((s) => s === scope.toLowerCase() || s.endsWith(`/${scope.toLowerCase()}`));
