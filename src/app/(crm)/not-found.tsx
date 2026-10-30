import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <p className="text-4xl font-medium text-brand">404</p>
      <h1 className="mt-2 text-lg font-medium">Registro no encontrado</h1>
      <p className="mt-1 text-sm text-muted">No existe o no tienes permiso para verlo.</p>
      <Link href="/inicio" className="btn btn-primary mt-5">Ir al inicio</Link>
    </div>
  );
}
