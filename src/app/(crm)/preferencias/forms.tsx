"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { savePreferences, saveProfile } from "./actions";
import { updatePassword } from "@/app/(auth)/actions";
import type { Preferences } from "@/lib/session";

export function PreferencesForm({ prefs }: { prefs: Preferences }) {
  const [state, action] = useActionState(savePreferences, {});
  return (
    <form action={action} className="space-y-4 p-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset>
        <legend className="label">Tema</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[["light", "Claro"], ["dark", "Oscuro"], ["system", "Según el sistema"]].map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2.5 text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="theme" value={v} defaultChecked={prefs.theme === v} className="accent-[var(--brand)]" /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="home_page">Página de inicio</label>
          <select id="home_page" name="home_page" className="select" defaultValue={prefs.home_page}>
            <option value="/inicio">Inicio (mi resumen)</option>
            <option value="/oportunidades/pipeline">Pipeline de oportunidades</option>
            <option value="/indicadores">Indicadores</option>
            <option value="/actividades">Mi agenda</option>
            <option value="/cuentas">Cuentas</option>
            <option value="/oportunidades">Lista de oportunidades</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="density">Densidad de las listas</label>
          <select id="density" name="density" className="select" defaultValue={prefs.density}>
            <option value="comfortable">Cómoda</option>
            <option value="compact">Compacta</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="page_size">Registros por página</label>
          <select id="page_size" name="page_size" className="select" defaultValue={String(prefs.page_size)}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="language">Idioma</label>
          <select id="language" name="language" className="select" defaultValue={prefs.language}>
            <option value="es">Español (Colombia)</option>
            <option value="en">English</option>
          </select>
          <p className="help">En inglés se traducen la navegación, las listas, los formularios y los nombres de campos; algunas pantallas siguen en español.</p>
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Guardando…">Guardar preferencias</SubmitButton></div>
    </form>
  );
}

export function ProfileForm({ fullName, title, phone, email }: { fullName: string; title: string | null; phone: string | null; email: string }) {
  const [state, action] = useActionState(saveProfile, {});
  return (
    <form action={action} className="space-y-4 p-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="full_name">Nombre completo</label>
          <input id="full_name" name="full_name" className="input" defaultValue={fullName} />
          {state.errors?.full_name && <p className="error-text">{state.errors.full_name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input id="email" className="input" value={email} disabled />
        </div>
        <div>
          <label className="label" htmlFor="title">Cargo</label>
          <input id="title" name="title" className="input" defaultValue={title ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Teléfono</label>
          <input id="phone" name="phone" className="input" defaultValue={phone ?? ""} />
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Guardando…">Guardar perfil</SubmitButton></div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(updatePassword, {});
  return (
    <form action={action} className="space-y-4 p-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Nueva contraseña</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" />
          {state.errors?.password && <p className="error-text">{state.errors.password}</p>}
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmar</label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" />
          {state.errors?.confirm && <p className="error-text">{state.errors.confirm}</p>}
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Guardando…">Cambiar contraseña</SubmitButton></div>
    </form>
  );
}
