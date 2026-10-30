import Link from "next/link";
import { OBJECTS, type ObjectKey } from "@/lib/objects";

export function ObjectTabs({ base, active, objects }: { base: string; active: ObjectKey; objects?: ObjectKey[] }) {
  const list = objects ?? (Object.keys(OBJECTS) as ObjectKey[]);
  return (
    <div className="card">
      <div role="tablist" className="flex overflow-x-auto border-b border-line px-4">
        {list.map((o) => (
          <Link key={o} role="tab" href={`${base}?objeto=${o}`} aria-selected={o === active} className="tab">{OBJECTS[o].plural}</Link>
        ))}
      </div>
    </div>
  );
}
