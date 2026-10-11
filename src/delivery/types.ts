export type DeliveryRunStatus = "RUNNING" | "SUCCESS" | "FAILED";

export interface DailyDeliveryRun {
  deliveryRunId: string;
  userId: string;
  localDate: string;
  status: DeliveryRunStatus;
  screeningRunId?: string;
  researchCount?: number;
  publishedCount?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}
