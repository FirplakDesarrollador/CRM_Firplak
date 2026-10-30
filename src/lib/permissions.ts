export const PERMISSION_OBJECTS = [
  "leads", "accounts", "contacts", "opportunities", "quotes", "orders", "products", "cases", "campaigns", "activities",
] as const;
export type PermissionObject = (typeof PERMISSION_OBJECTS)[number];

export const OBJECT_ACTIONS = ["read", "create", "edit", "delete", "view_all", "modify_all"] as const;
export type ObjectAction = (typeof OBJECT_ACTIONS)[number];

export const SYSTEM_PERMISSIONS = ["view_dashboards", "export", "manage_users", "customize", "use_mcp", "mcp_write"] as const;
export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[number];

export const ACTION_LABELS: Record<ObjectAction, string> = {
  read: "Leer",
  create: "Crear",
  edit: "Editar",
  delete: "Eliminar",
  view_all: "Ver todo",
  modify_all: "Modificar todo",
};

export const SYSTEM_LABELS: Record<SystemPermission, string> = {
  view_dashboards: "Ver indicadores",
  export: "Exportar datos",
  manage_users: "Administrar usuarios y permisos",
  customize: "Personalizar la aplicación",
  use_mcp: "Usar asistentes de IA (MCP)",
  mcp_write: "Hacer cambios con asistentes de IA",
};

export type PermissionMap = Partial<Record<PermissionObject, Partial<Record<ObjectAction, boolean>>>> & {
  system?: Partial<Record<SystemPermission, boolean>>;
};

export type Access = { isAdmin: boolean; profile: string | null; permissions: PermissionMap };

export function can(access: Access, object: PermissionObject, action: ObjectAction): boolean {
  return access.isAdmin || Boolean(access.permissions[object]?.[action]);
}

export function canSystem(access: Access, permission: SystemPermission): boolean {
  return access.isAdmin || Boolean(access.permissions.system?.[permission]);
}
