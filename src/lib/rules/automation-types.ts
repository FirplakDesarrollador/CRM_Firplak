export type AutomationAction =
  | { type: "assign_owner"; user_id: string }
  | { type: "create_task"; subject: string; due_in_days?: number; assign_to?: string; priority?: "high" | "normal" | "low" }
  | { type: "notify"; to: string; title: string; body?: string }
  | { type: "set_field"; field: string; value: string };
