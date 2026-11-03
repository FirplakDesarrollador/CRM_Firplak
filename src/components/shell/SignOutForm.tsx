"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { forgetDevice } from "@/lib/push/device";

/** Cierra sesión y deja de enviar notificaciones a este dispositivo; si eso tarda, igual cierra sesión. */
export function SignOutForm({ className, label }: { className: string; label: string }) {
  const action = async () => {
    await Promise.race([
      forgetDevice().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await signOut();
  };
  return (
    <form action={action}>
      <button type="submit" className={className}><LogOut size={15} /> {label}</button>
    </form>
  );
}
