"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteRecord } from "@/lib/records/actions";
import type { ObjectKey } from "@/lib/objects";

import { Tr } from "@/components/ui/Tr";
export function DeleteButton({ object, id, label }: { object: ObjectKey; id: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className="btn btn-danger"
        disabled={pending}
        onClick={() => {
          if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
          start(async () => {
            const res = await deleteRecord(object, id);
            if (res?.message) setError(res.message);
          });
        }}
      >
        <Trash2 size={15} /> <Tr>{pending ? "Eliminando…" : "Eliminar"}</Tr>
      </button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
