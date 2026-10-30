export type AutomationAction =
  | { type: "assign_owner"; user_id: string }
  | { type: "create_task"; subject: string; due_in_days?: number; assign_to?: string; priority?: "high" | "normal" | "low" }
  | { type: "notify"; to: string; title: string; body?: string }
  | { type: "set_field"; field: string; value: string };

/** Cuándo corre una automatización (las «programadas» se disparan por una fecha del registro). */
export const TRIGGERS = {
  create: "Al crear",
  update: "Al actualizar",
  create_or_update: "Al crear o actualizar",
  scheduled: "Programada (por fecha)",
} as const;
