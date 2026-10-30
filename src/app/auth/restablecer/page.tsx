"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Logo } from "@/components/brand/Logo";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, {});
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass w-full max-w-sm p-6">
        <Logo height={30} label={false} />
        <h1 className="mt-6 text-xl font-medium">Crea una nueva contraseña</h1>
        {state.ok ? (
          <div className="mt-5 space-y-4">
            <Alert tone="success">{state.message}</Alert>
            <Link href="/" className="btn btn-primary w-full">Ir al CRM</Link>
          </div>
        ) : (
          <form action={action} className="mt-5 space-y-4">
            {state.message && <Alert tone="error">{state.message}</Alert>}
            <div>
              <label className="label" htmlFor="password">Nueva contraseña</label>
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" />
              {state.errors?.password && <p className="error-text">{state.errors.password}</p>}
            </div>
            <div>
              <label className="label" htmlFor="confirm">Confirmar contraseña</label>
              <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" />
              {state.errors?.confirm && <p className="error-text">{state.errors.confirm}</p>}
            </div>
            <SubmitButton className="btn btn-primary w-full" pendingText="Guardando…">Guardar contraseña</SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
