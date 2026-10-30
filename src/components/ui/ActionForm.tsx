"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/records/form";
import { useT } from "@/lib/i18n/client";

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

export function ConfirmSubmit({ children, message, className = "btn btn-sm btn-danger", formAction }: {
  children: React.ReactNode; message: string; className?: string; formAction?: (formData: FormData) => void;
}) {
  return (
    <button type="submit" className={className} formAction={formAction} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
