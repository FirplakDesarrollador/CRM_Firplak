"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

export default function RecoverPage() {
  const [state, action] = useActionState(requestPasswordReset, {});
  return (
    <>
      <h1 className="text-2xl font-medium">Recupera tu contraseña</h1>
      <p className="mt-1 text-sm text-muted">Te enviaremos un enlace para crear una nueva.</p>
      <form action={action} className="mt-6 space-y-4">
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" className="input" required defaultValue={state.values?.email} />
          {state.errors?.email && <p className="error-text">{state.errors.email}</p>}
        </div>
        <SubmitButton className="btn btn-primary w-full" pendingText="Enviando…">Enviar enlace</SubmitButton>
        <p className="text-center text-sm"><Link href="/login" className="link">Volver a ingresar</Link></p>
      </form>
    </>
  );
}
