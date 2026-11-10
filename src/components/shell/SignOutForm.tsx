"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { forgetDevice } from "@/lib/push/device";
import { clearDrafts } from "@/lib/drafts";
import { menuItemClass } from "@/components/ui/Dropdown";

/** Cierra sesión y deja de enviar notificaciones a este dispositivo; si eso tarda, igual cierra sesión. */
export function SignOutForm({ label }: { label: string }) {
  const action = async () => {
    // Los borradores de formularios viven en este dispositivo: no deben quedar para quien lo use después.
    clearDrafts();
    await Promise.race([
      forgetDevice().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await signOut();
  };
  return (
    <form action={action}>
      <button type="submit" className={menuItemClass.replace("text-ink", "text-danger")}><LogOut size={15} /> {label}</button>
    </form>
  );
}
