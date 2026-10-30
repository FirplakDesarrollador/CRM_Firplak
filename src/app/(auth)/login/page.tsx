import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-medium"><Tr>Ingresa a tu cuenta</Tr></h1>
      <p className="mt-1 text-sm text-muted"><Tr>Usa tu correo corporativo.</Tr></p>
      <LoginForm next={next ?? "/"} linkError={error === "link" ? "El enlace no es válido o ya expiró." : undefined} />
    </>
  );
}
