import { BrandBackdrop } from "@/components/brand/BrandBackdrop";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shell/AppHeader";
import { NavTabs } from "@/components/shell/NavTabs";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { PushSync } from "@/components/pwa/PushSettings";
import { vapidPublicKey } from "@/lib/push/config";
import { navItems } from "@/components/shell/nav";
import { Alert } from "@/components/ui/Alert";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getDataLabels, getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";

import { Tr } from "@/components/ui/Tr";
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const [locale, dataLabels] = await Promise.all([getLocale(), getDataLabels()]);
  const t = makeT(locale, dataLabels);
  const [{ data: notifications }, { count: unread }] = await Promise.all([
    supabase.from("notifications").select("id, title, body, link, is_read, created_at").order("created_at", { ascending: false }).limit(15),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
  ]);

  const pushKey = vapidPublicKey();

  return (
    <I18nProvider locale={locale} data={dataLabels}>
    <div className="min-h-dvh">
      {/* Primer elemento con Tab: salta la cabecera y los 17 módulos directo al contenido. */}
      <a href="#contenido" className="skip-link">{t("Saltar al contenido")}</a>
      <BrandBackdrop />
      <AppHeader user={user} notifications={notifications ?? []} unread={unread ?? 0} t={t} />
      <div className="hidden md:block"><NavTabs items={navItems(user.access, t)} /></div>
      {!user.isActive && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
          <Alert tone="warning"><Tr>Tu usuario está desactivado. Pide al administrador que lo active para ver la información.</Tr></Alert>
        </div>
      )}
      <main id="contenido" tabIndex={-1} className="mx-auto max-w-[1600px] outline-none px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-5 sm:px-6 md:pb-5">{children}</main>
      <MobileTabBar items={navItems(user.access, t)} />
      {pushKey && <PushSync publicKey={pushKey} userId={user.id} />}
    </div>
    </I18nProvider>
  );
}
