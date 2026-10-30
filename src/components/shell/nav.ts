import type { Access } from "@/lib/permissions";
import { can, canSystem } from "@/lib/permissions";
import type { T } from "@/lib/i18n";

export type NavItem = { href: string; label: string; icon: string };

export function navItems(access: Access, t: T = (s) => s): NavItem[] {
  const items: NavItem[] = [{ href: "/inicio", label: "Inicio", icon: "home" }];
  if (can(access, "leads", "read")) items.push({ href: "/prospectos", label: "Prospectos", icon: "leads" });
  if (can(access, "accounts", "read")) items.push({ href: "/cuentas", label: "Cuentas", icon: "accounts" });
  if (can(access, "contacts", "read")) items.push({ href: "/contactos", label: "Contactos", icon: "contacts" });
  if (can(access, "opportunities", "read")) items.push({ href: "/oportunidades", label: "Oportunidades", icon: "opportunities" });
  if (can(access, "quotes", "read")) items.push({ href: "/cotizaciones", label: "Cotizaciones", icon: "quotes" });
  if (can(access, "orders", "read")) items.push({ href: "/pedidos", label: "Pedidos", icon: "orders" });
  if (can(access, "products", "read")) items.push({ href: "/productos", label: "Productos", icon: "products" });
  if (can(access, "cases", "read")) items.push({ href: "/casos", label: "Casos", icon: "cases" });
  if (can(access, "campaigns", "read")) items.push({ href: "/campanas", label: "Campañas", icon: "campaigns" });
  if (can(access, "activities", "read")) items.push({ href: "/actividades", label: "Actividades", icon: "activities" });
  items.push({ href: "/aprobaciones", label: "Aprobaciones", icon: "approvals" });
  if (canSystem(access, "view_dashboards")) {
    items.push({ href: "/indicadores", label: "Indicadores", icon: "dashboard" });
    items.push({ href: "/metas", label: "Metas", icon: "goals" });
    items.push({ href: "/pronostico", label: "Pronóstico", icon: "forecast" });
    items.push({ href: "/informes", label: "Informes", icon: "reports" });
  }
  if (canSystem(access, "customize") || canSystem(access, "manage_users")) {
    items.push({ href: "/configuracion", label: "Configuración", icon: "settings" });
  }
  return items.map((i) => ({ ...i, label: t(i.label) }));
}
