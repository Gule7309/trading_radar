export type NotificationType =
  | "DAILY_RESEARCH_READY"
  | "THESIS_CHANGED"
  | "EVIDENCE_CONFLICT";

export interface NotificationItem {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  ticker?: string;
  thesisId?: string;
  researchRunId?: string;
  screeningRunId?: string;
  createdAt: string;
  readAt?: string;
  metadata?: Record<string, unknown>;
}
