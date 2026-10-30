import {
  Building2, CalendarCheck, PieChart, Flag, LineChart, Gauge, Home, Settings, Target, UserRound, UserPlus, Package, FileText, LifeBuoy, Megaphone,
  Phone, Users, Mail, StickyNote, CheckSquare, type LucideIcon,
} from "lucide-react";

export const OBJECT_ICONS: Record<string, LucideIcon> = {
  home: Home,
  accounts: Building2,
  contacts: UserRound,
  opportunities: Target,
  activities: CalendarCheck,
  leads: UserPlus,
  products: Package,
  quotes: FileText,
  cases: LifeBuoy,
  campaigns: Megaphone,
  dashboard: Gauge,
  reports: PieChart,
  goals: Flag,
  forecast: LineChart,
  settings: Settings,
};

export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  task: CheckSquare,
  call: Phone,
  meeting: Users,
  email: Mail,
  note: StickyNote,
};

export function ObjectIcon({ object, size = 18 }: { object: string; size?: number }) {
  const Icon = OBJECT_ICONS[object] ?? Building2;
  return (
    <span className={`object-icon obj-${object}`} style={{ width: size + 18, height: size + 18 }}>
      <Icon size={size} />
    </span>
  );
}
