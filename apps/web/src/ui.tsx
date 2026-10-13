import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  X,
} from "lucide-react";
import { ApiError } from "./api";
import { label, safeUrl } from "./data";
import type { Weights } from "./contracts";
import s from "./app.module.css";

export function Status({ value }: { value?: string }) {
  const tracked = value === "ACTIVE";
  const published = value === "PUBLISHABLE";
  const bad = [
    "INVALIDATED",
    "REFUTED",
    "CONFLICTING",
    "FAILED",
    "REJECTED",
  ].includes(value || "");
  const good = ["SUPPORTED", "STRENGTHENED", "SUCCESS", "verified"].includes(
    value || "",
  );
  const Icon = tracked
    ? Bookmark
    : bad
      ? AlertCircle
      : good || published
        ? CheckCircle2
        : CircleHelp;
  return (
    <span
      className={`${s.status} ${tracked ? s.neutral : published ? s.info : bad ? s.bad : good ? s.good : s.caution}`}
    >
      <Icon size={13} aria-hidden="true" />
      {label(value)}
    </span>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  let message = error instanceof Error ? error.message : "操作未完成。";
  if (api?.status === 404)
    message =
      "此筆紀錄已不存在。Mock 後端重啟會清空資料，本機舊結果仍可閱讀，但需重新研究後才能送出回饋。";
  if (api?.status === 501)
    message = "目前後端尚未啟用這項功能。可在系統頁確認可用能力。";
  if (api?.status === 413)
    message = "資料超過後端容量限制，請提供較小且契約完整的資料。";
  return (
    <div className={s.error} role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>操作未完成</strong>
        <p>{message}</p>
        {api && <small>{api.code}</small>}
        {retry && (
          <button className={s.textButton} onClick={retry}>
            重新同步
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      {icon}
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
export function PageHeading({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <header className={s.pageHeading}>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children && <div className={s.actions}>{children}</div>}
    </header>
  );
}
export function External({
  url,
  children,
}: {
  url?: string | null;
  children: ReactNode;
}) {
  const href = safeUrl(url);
  return href ? (
    <a
      className={s.external}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalLink size={14} />
      <span className={s.srOnly}>（新分頁）</span>
    </a>
  ) : (
    <span className={s.muted}>未提供可開啟的連結</span>
  );
}
export function WeightsView({
  weights,
  delta,
}: {
  weights: Weights;
  delta?: Weights;
}) {
  return (
    <div className={s.weights}>
      {(Object.keys(weights) as (keyof Weights)[]).map((k) => (
        <div key={k}>
          <span>{label(k)}</span>
          <strong>{(weights[k] * 100).toFixed(1)}%</strong>
          {delta && (
            <small className={delta[k] !== 0 ? s.teal : s.muted}>
              {delta[k] > 0 ? "+" : ""}
              {(delta[k] * 100).toFixed(2)} 個百分點
            </small>
          )}
        </div>
      ))}
    </div>
  );
}
export function JsonDetails({
  title = "原始資料",
  value,
}: {
  title?: string;
  value: unknown;
}) {
  return (
    <details className={s.disclosure}>
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function Loading({ text = "正在讀取資料…" }: { text?: string }) {
  return (
    <p className={s.loading} role="status">
      {text}
    </p>
  );
}
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <div className={s.notice} role="status">
      <strong>
        研究請求處理中 · 已等候 {Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒
      </strong>
      <p>
        完成後會顯示結果。你可以繼續閱讀上次研究；後端目前沒有提供即時步驟。
      </p>
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  panel = false,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  panel?: boolean;
  wide?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const previous = useRef(false);
  if (open && !previous.current)
    returnFocus.current = document.activeElement as HTMLElement;
  previous.current = open;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={s.backdrop} />
        <Dialog.Popup
          className={panel ? s.drawer : `${s.modal} ${wide ? s.wideModal : ""}`}
          finalFocus={() =>
            returnFocus.current?.isConnected &&
            !returnFocus.current.closest("[hidden]")
              ? returnFocus.current
              : document.querySelector<HTMLElement>("[data-detail-start]")
          }
        >
          <div className={s.modalHeader}>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "檢視內容後可關閉，回到原來的位置。"}
              </Dialog.Description>
            </div>
            <Dialog.Close className={s.iconButton} aria-label="關閉面板">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className={s.modalBody}>{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
