"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { savePreferences, saveProfile } from "./actions";
import { GlassField } from "./GlassField";
import { updatePassword } from "@/app/(auth)/actions";
import type { Preferences } from "@/lib/session";

import { Tr } from "@/components/ui/Tr";
import { Opt } from "@/components/ui/Opt";
export function PreferencesForm({ prefs }: { prefs: Preferences }) {
  const [state, action] = useActionState(savePreferences, {});
  return (
    <form action={action} className="space-y-4 p-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset>
        <legend className="label"><Tr>Tema</Tr></legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[["light", "Claro"], ["dark", "Oscuro"], ["system", "Según el sistema"]].map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2.5 text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="theme" value={v} defaultChecked={prefs.theme === v} className="accent-[var(--brand)]" /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <GlassField saved={prefs.glass} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="home_page"><Tr>Página de inicio</Tr></label>
          <select id="home_page" name="home_page" className="select" defaultValue={prefs.home_page}>
            <Opt value="/inicio">Inicio (mi resumen)</Opt>
            <Opt value="/oportunidades/pipeline">Pipeline de oportunidades</Opt>
            <Opt value="/indicadores">Indicadores</Opt>
            <Opt value="/actividades">Mi agenda</Opt>
            <Opt value="/cuentas">Cuentas</Opt>
            <Opt value="/oportunidades">Lista de oportunidades</Opt>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="density"><Tr>Densidad de las listas</Tr></label>
          <select id="density" name="density" className="select" defaultValue={prefs.density}>
            <Opt value="comfortable">Cómoda</Opt>
            <Opt value="compact">Compacta</Opt>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="page_size"><Tr>Registros por página</Tr></label>
          <select id="page_size" name="page_size" className="select" defaultValue={String(prefs.page_size)}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="language"><Tr>Idioma</Tr></label>
          <select id="language" name="language" className="select" defaultValue={prefs.language}>
            <Opt value="es">Español (Colombia)</Opt>
            <Opt value="en">English</Opt>
          </select>
          <p className="help"><Tr>Cambia toda la interfaz. Los datos (etapas, valores de listas, campos personalizados y mensajes de reglas) se muestran tal como se crearon.</Tr></p>
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Guardando…"><Tr>Guardar preferencias</Tr></SubmitButton></div>
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
          <label className="label" htmlFor="full_name"><Tr>Nombre completo</Tr></label>
          <input id="full_name" name="full_name" className="input" defaultValue={fullName} />
          {state.errors?.full_name && <p className="error-text">{state.errors.full_name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="email"><Tr>Correo</Tr></label>
          <input id="email" className="input" value={email} disabled />
        </div>
        <div>
          <label className="label" htmlFor="title"><Tr>Cargo</Tr></label>
          <input id="title" name="title" className="input" defaultValue={title ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="phone"><Tr>Teléfono</Tr></label>
          <input id="phone" name="phone" className="input" defaultValue={phone ?? ""} />
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Guardando…"><Tr>Guardar perfil</Tr></SubmitButton></div>
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
          <label className="label" htmlFor="password"><Tr>Nueva contraseña</Tr></label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" />
          {state.errors?.password && <p className="error-text">{state.errors.password}</p>}
        </div>
        <div>
          <label className="label" htmlFor="confirm"><Tr>Confirmar</Tr></label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" />
          {state.errors?.confirm && <p className="error-text">{state.errors.confirm}</p>}
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Guardando…"><Tr>Cambiar contraseña</Tr></SubmitButton></div>
    </form>
  );
}
