"use client";

import { Printer } from "lucide-react";

import { Tr } from "@/components/ui/Tr";
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Printer size={15} /> <Tr>Imprimir o guardar PDF</Tr>
    </button>
  );
}
