import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-medium">Ingresa a tu cuenta</h1>
      <p className="mt-1 text-sm text-muted">Usa tu correo corporativo.</p>
      <LoginForm next={next ?? "/"} linkError={error === "link" ? "El enlace no es válido o ya expiró." : undefined} />
    </>
  );
}
