"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function OwnerSelect({ value, users }: { value: string; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select aria-label="Propietario" className="select h-9 w-auto" value={value}
      onChange={(e) => {
        const qs = new URLSearchParams(params);
        qs.set("propietario", e.target.value);
        router.push(`${pathname}?${qs}`);
      }}>
      <option value="me">Mi calendario</option>
      <option value="all">Todo el equipo</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}
