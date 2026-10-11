export type DeliveryRunStatus =
  | "RUNNING"
  | "WAITING_FOR_FRESH_DATA"
  | "SUCCESS"
  | "FAILED";

export interface DailyDeliveryRun {
  deliveryRunId: string;
  userId: string;
  localDate: string;
  status: DeliveryRunStatus;
  screeningRunId?: string;
  priceAsOf?: string;
  researchCount?: number;
  publishedCount?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}
