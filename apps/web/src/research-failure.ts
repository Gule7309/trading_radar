import type { StoredRun } from "./contracts";

export function failureExplanation(message: string) {
  if (/prepayment credits are depleted/i.test(message))
    return "Google 專案預付額度已用完（402）。請恢復該專案額度，或在後端改用有額度的專案金鑰；此時重試或更換同專案模型無法解決。";
  if (/exceeded.*quota|RESOURCE_EXHAUSTED|\b429\b/i.test(message))
    return "模型或搜尋服務額度不足（429）。請確認專案配額與用量，恢復後再研究。";
  if (/no longer available to new users/i.test(message))
    return "目前帳號不能使用這個模型。請在後端選擇帳號可存取的模型。";
  if (/high demand|UNAVAILABLE|\b503\b/i.test(message))
    return "模型服務目前壅塞（503）。請稍後再試；這次沒有可發布的研究結論。";
  return "模型執行未完成，尚無可發布結論。請開啟執行紀錄查看診斷。";
}

// The batch API does not return rejected run IDs. Show the nearest preceding
// run for the same candidate as a related diagnostic, never as an exact batch ID.
export function relatedFailedRun(
  runs: StoredRun[],
  candidateId: string,
  before: string,
) {
  const cutoff = Date.parse(before);
  return runs
    .filter(
      (run) =>
        run.candidate.candidateId === candidateId &&
        run.result.stopReason === "MODEL_FAILURE" &&
        Date.parse(run.result.completedAt) <= cutoff,
    )
    .sort(
      (a, b) =>
        Date.parse(b.result.completedAt) - Date.parse(a.result.completedAt),
    )[0];
}
