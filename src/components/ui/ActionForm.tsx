"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/records/form";
import { useT } from "@/lib/i18n/client";
import { useConfirm } from "./ConfirmDialog";

/** Formulario ligado a una Server Action que muestra el resultado en línea. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const t = useT();
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.message && (
        <p role="status" className={`text-xs font-semibold ${state.ok ? "text-success" : "text-danger"} basis-full`}>{t(state.message)}</p>
      )}
    </form>
  );
}

/**
 * Botón de envío que antes pide confirmación con el diálogo del CRM (no el del navegador). Si se confirma,
 * envía el formulario con este mismo botón, así se respeta su `formAction`.
 */
export function ConfirmSubmit({ children, message, body, confirmLabel, className = "btn btn-sm btn-danger", formAction, "aria-label": ariaLabel }: {
  children: React.ReactNode; message: string; body?: string; confirmLabel?: string; className?: string;
  formAction?: (formData: FormData) => void; "aria-label"?: string;
}) {
  const [dialog, ask] = useConfirm();
  const danger = /\b(btn-danger|text-danger)\b/.test(className);
  return (
    <>
      <button type="submit" className={className} formAction={formAction} aria-label={ariaLabel}
        onClick={async (e) => {
          const button = e.currentTarget;
          e.preventDefault();
          if (await ask({ title: message, body, confirmLabel, tone: danger ? "danger" : "primary" })) button.form?.requestSubmit(button);
        }}>
        {children}
      </button>
      {dialog}
    </>
  );
}
