"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";

import { useT } from "@/lib/i18n/client";

import { Fmt } from "@/components/ui/Fmt";
export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };

export function NotificationBell({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <Dropdown
      label={t("Notificaciones")}
      className="btn btn-ghost btn-icon relative"
      trigger={
        <>
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.62rem] font-semibold leading-4 text-[var(--cream-50)]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between gap-3 px-2.5 pb-2 pt-1.5">
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted">{t("Notificaciones")}</p>
        {unread > 0 && (
          <button type="button" className="text-xs font-medium text-brand" disabled={pending}
            onClick={() => start(() => markAllNotificationsRead())}>
            {t("Marcar todas como leídas")}
          </button>
        )}
      </div>
      <ul className="max-h-96 w-80 overflow-y-auto">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t("Sin notificaciones.")}</li>}
        {items.map((n) => {
          const content = (
            <>
              <p className={`text-sm ${n.is_read ? "text-ink-2" : "font-medium text-ink"}`}>{n.title}</p>
              {n.body && <p className="line-clamp-2 text-xs text-muted">{n.body}</p>}
              <p className="mt-0.5 text-[0.68rem] text-muted"><Fmt datetime={n.created_at} /></p>
            </>
          );
          const cls = `block rounded-md px-2.5 py-2 no-underline hover:bg-surface-3 ${n.is_read ? "" : "bg-brand-soft/60"}`;
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} className={cls} onClick={() => !n.is_read && start(() => markNotificationRead(n.id))}>{content}</Link>
              ) : (
                <button type="button" className={`${cls} w-full text-left`} onClick={() => !n.is_read && start(() => markNotificationRead(n.id))}>{content}</button>
              )}
            </li>
          );
        })}
      </ul>
    </Dropdown>
  );
}
