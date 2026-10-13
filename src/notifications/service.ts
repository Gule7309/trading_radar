import { randomUUID } from "node:crypto";
import type { ResearchResult } from "../domain/research.js";
import type { ThesisVersion } from "../thesis/types.js";
import type { NotificationStore } from "./store.js";
import type { NotificationItem } from "./types.js";

export class NotificationService {
  constructor(private readonly store: NotificationStore) {}

  async dailyResearchReady(input: {
    userId: string;
    screeningRunId: string;
    publishedCount: number;
    researchedCount: number;
  }): Promise<NotificationItem> {
    const now = new Date().toISOString();
    const item: NotificationItem = {
      notificationId: randomUUID(),
      userId: input.userId,
      type: "DAILY_RESEARCH_READY",
      title: "今日研究已完成",
      message:
        input.publishedCount > 0
          ? `今日研究已完成，共找到 ${input.publishedCount} 檔可發布研究結論。`
          : "今日研究已完成，但目前沒有足夠證據可發布的候選股。",
      screeningRunId: input.screeningRunId,
      createdAt: now,
      metadata: {
        publishedCount: input.publishedCount,
        researchedCount: input.researchedCount,
      },
    };
    await this.store.save(item);
    return item;
  }

  async thesisChanged(input: {
    userId: string;
    thesis: ThesisVersion;
    researchRunId: string;
  }): Promise<NotificationItem | null> {
    if (
      input.thesis.status !== "STRENGTHENED" &&
      input.thesis.status !== "WEAKENED" &&
      input.thesis.status !== "INVALIDATED"
    ) {
      return null;
    }

    const item: NotificationItem = {
      notificationId: randomUUID(),
      userId: input.userId,
      type: "THESIS_CHANGED",
      title:
        input.thesis.status === "INVALIDATED"
          ? "投資論點已失效"
          : input.thesis.status === "WEAKENED"
            ? "投資論點已轉弱"
            : "投資論點已增強",
      message:
        input.thesis.changeReason ??
        "新的可驗證證據改變了原本的 Investment Thesis。",
      ticker: input.thesis.ticker,
      thesisId: input.thesis.thesisId,
      researchRunId: input.researchRunId,
      createdAt: new Date().toISOString(),
      metadata: {
        thesisStatus: input.thesis.status,
        version: input.thesis.version,
      },
    };

    await this.store.save(item);
    return item;
  }

  async evidenceConflict(input: {
    userId: string;
    result: ResearchResult;
    thesisId?: string;
  }): Promise<NotificationItem | null> {
    if (
      input.result.stopReason !== "UNRESOLVED_CONFLICT" &&
      input.result.verificationSummary.unresolvedConflicts <= 0
    ) {
      return null;
    }

    const item: NotificationItem = {
      notificationId: randomUUID(),
      userId: input.userId,
      type: "EVIDENCE_CONFLICT",
      title: "追蹤標的出現證據衝突",
      message:
        "來源間存在未解決矛盾，系統已停止更新相關結論，等待更多可驗證證據。",
      ticker: input.result.ticker,
      thesisId: input.thesisId,
      researchRunId: input.result.runId,
      createdAt: new Date().toISOString(),
      metadata: {
        unresolvedConflicts:
          input.result.verificationSummary.unresolvedConflicts,
      },
    };

    await this.store.save(item);
    return item;
  }

  async list(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ) {
    return this.store.list(userId, options);
  }

  async markRead(userId: string, notificationId: string) {
    return this.store.markRead(
      userId,
      notificationId,
      new Date().toISOString(),
    );
  }
}
