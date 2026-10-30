"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { Tr } from "@/components/ui/Tr";
export default function RecoverPage() {
  const [state, action] = useActionState(requestPasswordReset, {});
  return (
    <>
      <h1 className="text-2xl font-medium"><Tr>Recupera tu contraseña</Tr></h1>
      <p className="mt-1 text-sm text-muted"><Tr>Te enviaremos un enlace para crear una nueva.</Tr></p>
      <form action={action} className="mt-6 space-y-4">
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <div>
          <label className="label" htmlFor="email"><Tr>Correo</Tr></label>
          <input id="email" name="email" type="email" className="input" required defaultValue={state.values?.email} />
          {state.errors?.email && <p className="error-text">{state.errors.email}</p>}
        </div>
        <SubmitButton className="btn btn-primary w-full" pendingText="Enviando…"><Tr>Enviar enlace</Tr></SubmitButton>
        <p className="text-center text-sm"><Link href="/login" className="link"><Tr>Volver a ingresar</Tr></Link></p>
      </form>
    </>
  );
}
