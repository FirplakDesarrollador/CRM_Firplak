import { Composer } from "./Composer";
import { Timeline } from "./Timeline";
import type { ActivityRow } from "./data";
import type { UserOption } from "@/lib/records/data";

export function ActivityPanel({
  related,
  activities,
  users,
  userId,
  canCreate,
}: {
  related: { account_id?: string | null; contact_id?: string | null; opportunity_id?: string | null; lead_id?: string | null; case_id?: string | null };
  activities: ActivityRow[];
  users: UserOption[];
  userId: string;
  canCreate: boolean;
}) {
  return (
    <section className="glass">
      <div className="card-header"><h2 className="card-title">Actividad</h2></div>
      <div className="px-4 pb-4">
        {canCreate && <Composer related={related} users={users} currentUserId={userId} />}
        <div className="mt-4 border-t border-line pt-3">
          <Timeline activities={activities} showRelated={!related.opportunity_id} />
        </div>
      </div>
    </section>
  );
}
