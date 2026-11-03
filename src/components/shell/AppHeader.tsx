import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, FileUp, Mail, Plus, Settings, SlidersHorizontal, UserRound } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Dropdown, menuItemClass } from "@/components/ui/Dropdown";
import { OBJECT_ICONS } from "@/components/ui/icons";
import { SignOutForm } from "./SignOutForm";
import { can, canSystem } from "@/lib/permissions";
import { initials } from "@/lib/format";
import type { CurrentUser } from "@/lib/session";
import type { T } from "@/lib/i18n";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell, type NotificationItem } from "./NotificationBell";

export function AppHeader({ user, notifications, unread, t }: { user: CurrentUser; notifications: NotificationItem[]; unread: number; t: T }) {
  const quick = [
    { href: "/prospectos/nuevo", label: t("Prospecto"), icon: "leads", ok: can(user.access, "leads", "create") },
    { href: "/cuentas/nueva", label: t("Cuenta"), icon: "accounts", ok: can(user.access, "accounts", "create") },
    { href: "/contactos/nuevo", label: t("Contacto"), icon: "contacts", ok: can(user.access, "contacts", "create") },
    { href: "/oportunidades/nueva", label: t("Oportunidad"), icon: "opportunities", ok: can(user.access, "opportunities", "create") },
    { href: "/casos/nuevo", label: t("Caso"), icon: "cases", ok: can(user.access, "cases", "create") },
    { href: "/actividades/nueva", label: t("Actividad"), icon: "activities", ok: can(user.access, "activities", "create") },
  ].filter((q) => q.ok);

  return (
    <header className="shell-chrome shell-bar sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Link href="/inicio" className="flex-none no-underline" aria-label="Inicio">
          <span className="hidden sm:inline-flex"><Logo height={30} /></span>
          <span className="inline-flex sm:hidden"><LogoMark size={28} /></span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-center px-2">
          <Suspense fallback={<div className="input h-9 max-w-xl rounded-full bg-surface-2" />}>
            <GlobalSearch />
          </Suspense>
        </div>
        {quick.length > 0 && (
          <Dropdown label="Crear" className="btn btn-primary btn-icon sm:w-auto sm:px-3" trigger={<><Plus size={16} /><span className="hidden sm:inline">{t("Nuevo")}</span></>}>
            <p className="px-2.5 pb-1 pt-1.5 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted">{t("Crear")}</p>
            {quick.map((q) => {
              const Icon = OBJECT_ICONS[q.icon];
              return (
                <Link key={q.href} href={q.href} className={menuItemClass}>
                  <Icon size={15} className="text-muted" /> {q.label}
                </Link>
              );
            })}
          </Dropdown>
        )}
        <NotificationBell items={notifications} unread={unread} />
        <Dropdown
          label="Menú de usuario"
          className="flex items-center gap-2 rounded-full p-0.5 pr-1.5 hover:bg-surface-3"
          trigger={
            <>
              <span className="avatar">{initials(user.fullName)}</span>
              <ChevronDown size={14} className="hidden text-muted sm:block" />
            </>
          }
        >
          <div className="border-b border-line px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-1 text-xs font-medium text-accent">{user.access.profile ?? t("Sin perfil")}{user.roleName ? ` · ${user.roleName}` : ""}</p>
          </div>
          <div className="pt-1">
            <Link href="/preferencias" className={menuItemClass}><SlidersHorizontal size={15} className="text-muted" /> {t("Mis preferencias")}</Link>
            <Link href="/preferencias?tab=perfil" className={menuItemClass}><UserRound size={15} className="text-muted" /> {t("Mi perfil")}</Link>
            <Link href="/importar" className={menuItemClass}><FileUp size={15} className="text-muted" /> {t("Importar datos")}</Link>
            <Link href="/correo/plantillas" className={menuItemClass}><Mail size={15} className="text-muted" /> {t("Plantillas de correo")}</Link>
            {(canSystem(user.access, "customize") || canSystem(user.access, "manage_users")) && (
              <Link href="/configuracion" className={menuItemClass}><Settings size={15} className="text-muted" /> {t("Configuración")}</Link>
            )}
            <SignOutForm label={t("Cerrar sesión")} />
          </div>
        </Dropdown>
      </div>
    </header>
  );
}
