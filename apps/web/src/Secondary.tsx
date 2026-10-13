import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, Check, RefreshCw } from "lucide-react";
import { api, API_BASE, DATA_MODE } from "./api";
import { useApp } from "./context-store";
import { date, label } from "./data";
import {
  Elapsed,
  Empty,
  ErrorBox,
  JsonDetails,
  Loading,
  PageHeading,
  Status,
} from "./ui";
import s from "./app.module.css";

export function Notifications() {
  const app = useApp();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notices =
    app.notifications.data?.notifications.filter(
      (n) => !unreadOnly || !n.readAt,
    ) || [];
  return (
    <>
      <PageHeading
        title="通知"
        text="研究完成、論點變化與來源衝突，都會在這裡留下紀錄。"
      >
        <button
          className={s.button}
          onClick={() => void app.notifications.refetch()}
        >
          <RefreshCw size={16} />
          同步通知
        </button>
      </PageHeading>
      <section className={s.notificationSettings}>
        <div>
          <h2>桌面通知</h2>
          <p>頁面開啟時每 30 秒同步；關閉頁面後不保證通知送達。</p>
          <p className={s.hint}>
            {app.noticePermission === "unsupported"
              ? "此瀏覽器不支援桌面通知，可繼續使用站內通知。"
              : app.noticePermission === "denied"
                ? "通知權限已被拒絕。若要開啟，請在瀏覽器網站設定調整權限。"
                : app.desktopEnabled
                  ? "已開啟。顯示通知不會自動標記已讀。"
                  : "尚未開啟，不影響站內通知。"}
          </p>
        </div>
        {app.desktopEnabled ? (
          <button className={s.button} onClick={app.disableDesktop}>
            關閉桌面通知
          </button>
        ) : (
          <button
            className={s.primary}
            disabled={
              ["denied", "unsupported"].includes(app.noticePermission) ||
              !app.health.data?.notifications
            }
            onClick={() => void app.enableDesktop()}
          >
            <Bell size={16} />
            開啟桌面通知
          </button>
        )}
      </section>
      <div className={s.toolbar}>
        <label className={s.checkLine}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          只看未讀
        </label>
        <span className={s.muted}>{notices.length} 則通知</span>
      </div>
      <ErrorBox error={app.notifications.error || app.readNotice.error} />
      {app.notifications.isLoading && <Loading />}
      {app.health.data && !app.health.data.notifications && (
        <p className={s.notice}>後端尚未啟用通知。</p>
      )}
      {app.notifications.data && !notices.length && (
        <Empty title="目前沒有待閱讀的通知">
          <p>完成每日研究、或追蹤論點有變化後，通知會出現在這裡。</p>
        </Empty>
      )}
      <div className={s.paper}>
        {notices.map((notice) => (
          <article
            className={`${s.notification} ${!notice.readAt ? s.unread : ""}`}
            key={notice.notificationId}
          >
            <div>
              <span className={s.notificationType}>
                {label(notice.type)}
                {!notice.readAt && " · 未讀"}
              </span>
              <h3>
                <button
                  className={s.linkButton}
                  onClick={() => void app.openNotice(notice)}
                >
                  {notice.title}
                </button>
              </h3>
              <p>{notice.message}</p>
              <time>{date(notice.createdAt)}</time>
            </div>
            {!notice.readAt && (
              <button
                className={s.button}
                disabled={!app.canWrite || app.readNotice.isPending}
                onClick={() => app.readNotice.mutate(notice.notificationId)}
              >
                <Check size={16} />
                標記已讀
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

export function Activity() {
  const app = useApp();
  const [params] = useSearchParams();
  const delivery = useQuery({
    queryKey: ["deliveries"],
    queryFn: api.deliveries,
    enabled: !!app.health.data?.proactiveDelivery,
  });
  const feedback = useQuery({
    queryKey: ["feedback"],
    queryFn: api.feedbackHistory,
    enabled: !!app.health.data?.personalization,
  });
  return (
    <>
      <PageHeading
        title="執行與回饋紀錄"
        text="區分任務目標日、資料日期與實際執行時間，回看每次研究與偏好變化。"
      >
        <button className={s.button} onClick={() => void app.sync()}>
          <RefreshCw size={16} />
          同步紀錄
        </button>
      </PageHeading>
      <section className={s.section}>
        <h2>每日研究送達</h2>
        <p className={s.muted}>
          排程狀態：
          {app.admin.data?.dailySchedulerEnabled
            ? `已啟用，盤後 ${app.admin.data.dailyResearchAfterHour}:00（台灣時間）為目標`
            : "未啟用或狀態尚未取得"}
          。排程執行與交易日判定由後端處理。
        </p>
        <ErrorBox error={delivery.error} />
        {delivery.isLoading && <Loading />}
        {params.has("delivery") && (
          <p className={s.notice}>
            通知導向執行摘要。若此瀏覽器未保存完整結果，後端目前無法取回完整歷史
            Top-K。
          </p>
        )}
        {delivery.data?.runs.length === 0 && <p>尚無每日任務紀錄。</p>}
        {delivery.data?.runs.map((run) => (
          <article className={s.historyEntry} key={run.deliveryRunId}>
            <div className={s.sectionTitle}>
              <h3>目標日 {run.localDate}</h3>
              <Status value={run.status} />
            </div>
            <dl className={s.definition}>
              <dt>行情日</dt>
              <dd>{run.priceAsOf || "未提供"}</dd>
              <dt>開始 / 完成</dt>
              <dd>
                {date(run.startedAt)} / {date(run.completedAt)}
              </dd>
              <dt>研究 / 發布</dt>
              <dd>
                {run.researchCount ?? "未提供"} /{" "}
                {run.publishedCount ?? "未提供"}
              </dd>
              <dt>追蹤重查 / 失敗</dt>
              <dd>
                {run.watchlistRechecked ?? "未提供"} /{" "}
                {run.watchlistRecheckFailed ?? "未提供"}
              </dd>
            </dl>
            {run.error && <p className={s.error}>{run.error}</p>}
            <p className={s.hint}>
              完整結果可在下方本機紀錄依執行時間核對；相同篩選 ID
              不一定代表同一次研究。
            </p>
          </article>
        ))}
      </section>
      <section className={s.section}>
        <h2>這個瀏覽器保存的研究</h2>
        <p className={s.hint}>
          依 API 環境與使用者隔離，最多保留 30 輪。快取不代表後端資料仍存在。
        </p>
        {!app.snapshots.length && <p>尚無本機研究紀錄。</p>}
        {app.snapshots.map((snapshot) => (
          <article className={s.recordRow} key={snapshot.id}>
            <div>
              <strong>{date(snapshot.createdAt)}</strong>
              <p>
                行情 {snapshot.input.run.priceAsOf} · 入選{" "}
                {snapshot.result.top.length} 檔
              </p>
            </div>
            <Link to={`/?snapshot=${snapshot.id}`}>閱讀此輪結果</Link>
          </article>
        ))}
      </section>
      <section className={s.section}>
        <h2>收藏與略過回饋</h2>
        <ErrorBox error={feedback.error} />
        {feedback.data?.feedback.length === 0 && <p>尚無回饋紀錄。</p>}
        {feedback.data?.feedback.map((item) => (
          <article className={s.historyEntry} key={item.feedbackId}>
            <div className={s.sectionTitle}>
              <h3>
                {item.ticker} · {label(item.action)}
              </h3>
              <time>{date(item.createdAt)}</time>
            </div>
            <p>{item.reasons.map(label).join("、")}</p>
            {item.note && <p>{item.note}</p>}
            <Link to={`/runs/${encodeURIComponent(item.runId)}`}>
              查看當時研究
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}

export function System() {
  const app = useApp();
  const data = useQuery({
    queryKey: ["data-status"],
    queryFn: api.dataStatus,
    enabled: !!app.health.data?.admin,
  });
  const model = useMutation({
    mutationFn: async () => {
      await app.assertWrite();
      return api.modelCheck();
    },
  });
  const status = app.admin.data;
  const capabilities = {
    batchResearch: "批次研究",
    personalization: "研究偏好",
    watchlist: "追蹤清單",
    thesisTracking: "論點版本",
    notifications: "通知",
    proactiveDelivery: "每日送達",
    admin: "系統狀態",
  } as const;
  return (
    <>
      <PageHeading
        title="系統狀態"
        text="確認研究服務、資料與排程是否可用。模型與憑證由後端管理。"
      >
        <button className={s.button} onClick={() => void app.sync()}>
          <RefreshCw size={16} />
          重新同步
        </button>
      </PageHeading>
      <ErrorBox error={app.health.error || app.admin.error} />
      <section className={s.paper}>
        <div className={s.formBody}>
          <h2>連線與環境</h2>
          <dl className={s.definition}>
            <dt>後端位址</dt>
            <dd>{API_BASE}</dd>
            <dt>前端環境</dt>
            <dd>{DATA_MODE}</dd>
            <dt>偵測到的環境</dt>
            <dd>{app.detectedMode || "尚未取得"}</dd>
            <dt>讀寫狀態</dt>
            <dd>
              {app.canWrite ? "已連線，可操作" : "尚未連線或環境不符，暫停寫入"}
            </dd>
          </dl>
          <div className={s.capabilities}>
            {Object.entries(capabilities).map(([key, text]) => (
              <div key={key}>
                <span>{text}</span>
                <strong>
                  {app.health.data?.[key as keyof typeof capabilities]
                    ? "已啟用"
                    : "未啟用"}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </section>
      {status && (
        <section className={s.section}>
          <h2>模型與資料</h2>
          <dl className={s.definition}>
            <dt>研究模型</dt>
            <dd>
              {status.llmProvider} / {status.llmModel || "型號未提供"}
            </dd>
            <dt>搜尋服務</dt>
            <dd>
              {status.searchProvider} / {status.searchModel || "型號未提供"}
            </dd>
            <dt>模型憑證</dt>
            <dd>
              {status.modelCredentialConfigured
                ? "已配置（不顯示內容）"
                : "未配置"}
            </dd>
            <dt>台股資料</dt>
            <dd>
              {status.taiwanDataConfigured ? "已配置" : "未配置真實資料庫"}
            </dd>
            <dt>自動排程</dt>
            <dd>
              {status.dailySchedulerEnabled
                ? `已啟用，目標 ${status.dailyResearchAfterHour}:00`
                : "未啟用"}
            </dd>
          </dl>
          <button
            className={s.button}
            disabled={!app.canWrite || model.isPending}
            onClick={() => model.mutate()}
          >
            {model.isPending ? "測試連線中…" : "測試模型連線"}
          </button>
          <ErrorBox error={model.error} />
          {model.data && (
            <p className={s.notice}>
              {model.data.ok ? "連線測試成功" : "連線測試未通過"} ·{" "}
              {model.data.provider} / {model.data.model || "未提供型號"} ·{" "}
              {model.data.latencyMs} ms
              {app.detectedMode === "mock" &&
                "；這是模擬回應，不代表真實模型已連線。"}
            </p>
          )}
        </section>
      )}
      <section className={s.section}>
        <h2>資料更新狀態</h2>
        <ErrorBox error={data.error} />
        {data.isLoading && <Loading />}
        {data.data && (
          <>
            <p>
              {data.data.configured
                ? "後端已配置資料來源，更新狀態詳見下方。"
                : "尚未配置真實資料來源。Mock 使用固定範例，不會自動變成最新行情。"}
            </p>
            <JsonDetails title="後端資料集狀態" value={data.data} />
          </>
        )}
      </section>
      {import.meta.env.DEV && app.detectedMode === "mock" && (
        <details className={s.devPanel}>
          <summary>開發展示：每日研究通知</summary>
          <p>
            <Link to="/design-qa">開啟畫面壓力測試（UI 測試替身）</Link>
          </p>
          <p>
            強制執行將略過 mock
            範例的舊資料檢查，也可能重複已完成任務。僅供展示每日通知，不能當成今日真實研究。
          </p>
          <button
            className={s.button}
            disabled={
              !app.canWrite || app.daily.isPending || app.research.isPending
            }
            onClick={() => app.daily.mutate(true)}
          >
            以舊範例強制展示每日研究
          </button>
          <ErrorBox error={app.daily.error} />
          {app.daily.isPending && <Elapsed since={app.daily.submittedAt} />}
        </details>
      )}
    </>
  );
}
