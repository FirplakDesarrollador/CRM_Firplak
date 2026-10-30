export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="skeleton h-12 w-72" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-96 w-full" />
    </div>
  );
}
