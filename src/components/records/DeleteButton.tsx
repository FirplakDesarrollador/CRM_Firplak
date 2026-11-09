"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteRecord } from "@/lib/records/actions";
import type { ObjectKey } from "@/lib/objects";

import { Tr } from "@/components/ui/Tr";
import { useConfirm } from "@/components/ui/ConfirmDialog";
export function DeleteButton({ object, id, label }: { object: ObjectKey; id: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, ask] = useConfirm();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className="btn btn-ghost text-danger"
        disabled={pending}
        aria-label={`Eliminar ${label}`}
        onClick={async () => {
          if (!(await ask({ title: `¿Eliminar ${label}?`, body: "Esta acción no se puede deshacer.", confirmLabel: "Eliminar", tone: "danger" }))) return;
          start(async () => {
            const res = await deleteRecord(object, id);
            if (res?.message) setError(res.message);
          });
        }}
      >
        {/* Botón discreto (texto en rojo, sin borde) y en el celular solo el ícono: no compite con «Editar». */}
        <Trash2 size={15} /> <span className="hidden sm:inline"><Tr>{pending ? "Eliminando…" : "Eliminar"}</Tr></span>
      </button>
      {dialog}
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
