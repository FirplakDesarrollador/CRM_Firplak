import Link from "next/link";

import { Tr } from "@/components/ui/Tr";
export default function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl font-medium text-brand">404</p>
      <h1 className="mt-2 text-lg font-medium"><Tr>Registro no encontrado</Tr></h1>
      <p className="mt-1 text-sm text-muted"><Tr>No existe o no tienes permiso para verlo.</Tr></p>
      <Link href="/inicio" className="btn btn-primary mt-5"><Tr>Ir al inicio</Tr></Link>
    </div>
  );
}
