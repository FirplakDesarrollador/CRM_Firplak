"use client";

import { RefreshCw } from "lucide-react";

export function RetryButton() {
  return (
    <button type="button" className="btn" onClick={() => window.location.reload()}>
      <RefreshCw size={15} /> Reintentar
    </button>
  );
}
