import { redirect } from "next/navigation";
import { AppHeader } from "@/components/shell/AppHeader";
import { NavTabs } from "@/components/shell/NavTabs";
import { navItems } from "@/components/shell/nav";
import { Alert } from "@/components/ui/Alert";
import { getCurrentUser } from "@/lib/session";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <NavTabs items={navItems(user.access)} />
      {!user.isActive && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6">
          <Alert tone="warning">Tu usuario está desactivado. Pide al administrador que lo active para ver la información.</Alert>
        </div>
      )}
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
