// Equipos de cuenta y de oportunidad (Fase 15). Sin dependencias de servidor ni de cliente.

export type TeamObject = "accounts" | "opportunities";
export type Access = "none" | "read" | "edit";

export const TEAM_OBJECTS: TeamObject[] = ["accounts", "opportunities"];

/** Roles estándar; se personalizan en Configuración → Listas de valores (Oportunidades). */
export const TEAM_ROLES = [
  "Gerente de cuenta", "Asesor comercial", "Asesor de proyectos", "Especificador", "Soporte técnico",
  "Gerente comercial", "Ejecutivo de canal", "Servicio al cliente", "Patrocinador ejecutivo", "Otro",
];

export const ACCESS_LABELS: Record<Access, string> = { none: "Sin acceso", read: "Solo lectura", edit: "Lectura y edición" };

/** Niveles del equipo de cuenta además del acceso a la cuenta. */
export const ACCOUNT_EXTRA_ACCESS = [
  { key: "opportunity_access", label: "Oportunidades" },
  { key: "case_access", label: "Casos" },
  { key: "contact_access", label: "Contactos" },
] as const;

export type TeamMember = {
  id: string;
  user_id: string;
  team_role: string;
  /** Acceso al registro (cuenta u oportunidad). */
  access: Access;
  opportunity_access?: Access;
  case_access?: Access;
  contact_access?: Access;
  user: { full_name: string; email: string; title: string | null; is_active: boolean } | null;
};
