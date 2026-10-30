import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shell/AppHeader";
import { NavTabs } from "@/components/shell/NavTabs";
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

  return (
    <I18nProvider locale={locale} data={dataLabels}>
    <div className="min-h-dvh">
      <AppHeader user={user} notifications={notifications ?? []} unread={unread ?? 0} t={t} />
      <NavTabs items={navItems(user.access, t)} />
      {!user.isActive && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
          <Alert tone="warning"><Tr>Tu usuario está desactivado. Pide al administrador que lo active para ver la información.</Tr></Alert>
        </div>
      )}
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">{children}</main>
    </div>
    </I18nProvider>
  );
}
