"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { syncQuote } from "@/lib/records/phase2-actions";
import type { FormState } from "@/lib/records/form";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function SyncButton({ quoteId, synced }: { quoteId: string; synced: boolean }) {
  const [state, action] = useActionState(syncQuote.bind(null, quoteId), {} as FormState);
  return (
    <form action={action} className="inline-flex flex-col items-end">
      <SubmitButton className="btn" pendingText="Sincronizando…"><RefreshCw size={15} /> {synced ? "Resincronizar" : "Sincronizar con oportunidad"}</SubmitButton>
      {state.message && <span className={`text-xs ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}
