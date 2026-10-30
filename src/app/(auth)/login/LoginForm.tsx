"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "../actions";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { Tr } from "@/components/ui/Tr";
export function LoginForm({ next, linkError }: { next: string; linkError?: string }) {
  const [state, action] = useActionState(signIn, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      {(state.message || linkError) && <Alert tone="error">{state.message ?? linkError}</Alert>}
      <div>
        <label className="label" htmlFor="email"><Tr>Correo</Tr></label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input"
          defaultValue={state.values?.email} placeholder="nombre@firplak.com" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password"><Tr>Contraseña</Tr></label>
          <Link href="/recuperar" className="link mb-1 text-xs"><Tr>¿Olvidaste tu contraseña?</Tr></Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <SubmitButton className="btn btn-primary w-full" pendingText="Ingresando…"><Tr>Ingresar</Tr></SubmitButton>
      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta? <Link href="/registro" className="link"><Tr>Regístrate</Tr></Link>
      </p>
    </form>
  );
}
