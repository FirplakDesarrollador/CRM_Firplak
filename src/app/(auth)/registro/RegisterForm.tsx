"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "../actions";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function RegisterForm() {
  const [state, action] = useActionState(signUp, {});
  if (state.ok) {
    return (
      <div className="mt-6 space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href="/login" className="btn w-full">Volver a ingresar</Link>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <div>
        <label className="label" htmlFor="full_name">Nombre completo</label>
        <input id="full_name" name="full_name" className="input" autoComplete="name" defaultValue={state.values?.full_name}
          aria-invalid={Boolean(state.errors?.full_name)} />
        {state.errors?.full_name && <p className="error-text">{state.errors.full_name}</p>}
      </div>
      <div>
        <label className="label" htmlFor="email">Correo corporativo</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" defaultValue={state.values?.email}
          aria-invalid={Boolean(state.errors?.email)} />
        {state.errors?.email && <p className="error-text">{state.errors.email}</p>}
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password"
          aria-invalid={Boolean(state.errors?.password)} />
        {state.errors?.password ? <p className="error-text">{state.errors.password}</p> : <p className="help">Mínimo 8 caracteres.</p>}
      </div>
      <SubmitButton className="btn btn-primary w-full" pendingText="Creando cuenta…">Crear cuenta</SubmitButton>
      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta? <Link href="/login" className="link">Ingresa</Link>
      </p>
    </form>
  );
}
