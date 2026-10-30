import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";
import { allowedEmailDomains } from "@/lib/env";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  const domains = allowedEmailDomains();
  return (
    <>
      <h1 className="text-2xl font-medium">Crea tu cuenta</h1>
      <p className="mt-1 text-sm text-muted">
        {domains.length ? `Disponible para correos ${domains.map((d) => `@${d}`).join(", ")}.` : "Acceso para el equipo comercial."}{" "}
        El primer usuario registrado será el administrador.
      </p>
      <RegisterForm />
    </>
  );
}
