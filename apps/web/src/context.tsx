import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, DATA_MODE, SCOPE } from "./api";
import { hardMatches, parseScreening, sample } from "./data";
import {
  WeightsSchema,
  type Batch,
  type Notice,
  type ScreeningOutput,
  type Snapshot,
  type Profile,
} from "./contracts";
import { loadSnapshots, storage, storeSnapshots } from "./storage";
import { Context } from "./context-store";

function useAppState() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = useRef(location.pathname);
  useEffect(() => {
    currentPath.current = location.pathname;
  }, [location.pathname]);
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 30_000,
  });
  const admin = useQuery({
    queryKey: ["admin"],
    queryFn: api.admin,
    enabled: !!health.data?.admin,
    refetchInterval: 30_000,
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: api.profile,
    enabled: !!health.data?.personalization,
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications,
    enabled: !!health.data?.notifications,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const detectedMode =
    health.data?.service.includes("mock") || admin.data?.llmProvider === "mock"
      ? "mock"
      : admin.data
        ? "live"
        : undefined;
  const canWrite =
    !!health.data?.ok && !health.isError && detectedMode === DATA_MODE;
  const [input, setInput] = useState<ScreeningOutput>(sample);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cacheError, setCacheError] = useState("");
  const archive = useRef<Snapshot[]>([]);
  const [noticePermission, setNoticePermission] = useState(
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );
  const [desktopEnabled, setDesktopEnabled] = useState(
    storage.read("desktop-notifications") === "yes",
  );
  useEffect(() => {
    const updatePermission = () => {
      if (typeof Notification !== "undefined")
        setNoticePermission(Notification.permission);
    };
    window.addEventListener("focus", updatePermission);
    return () => window.removeEventListener("focus", updatePermission);
  }, []);
  useEffect(() => {
    let alive = true;
    loadSnapshots()
      .then((items) => {
        if (alive) {
          archive.current = items;
          setSnapshots(items);
        }
      })
      .catch(() => {
        if (alive)
          setCacheError("此瀏覽器無法讀取本機研究紀錄；本次結果仍可閱讀。");
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function sync() {
    await client.invalidateQueries();
  }
  async function retain(
    result: Batch,
    screening: ScreeningOutput,
    profileUsed?: Profile,
  ) {
    const p = profileUsed || profile.data;
    if (!p) throw new Error("偏好尚未載入，無法保存研究環境。");
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      scope: SCOPE,
      createdAt: new Date().toISOString(),
      input: screening,
      result,
      weights: result.personalization?.softPreferences || p.softPreferences,
      profileUpdatedAt: p.updatedAt,
    };
    archive.current = [snapshot, ...archive.current].slice(0, 30);
    setSnapshots(archive.current);
    try {
      await storeSnapshots(archive.current);
    } catch {
      setCacheError("本機儲存空間不可用，重新整理後可能無法取回這次完整結果。");
    }
    return snapshot;
  }
  async function assertWrite() {
    if (!canWrite)
      throw new Error("後端尚未連線，或環境模式未吻合。請到系統頁檢查。");
    // Recheck before a mutation: the server at the same URL may have restarted in another mode.
    const status = await api.admin();
    client.setQueryData(["admin"], status);
    if ((status.llmProvider === "mock" ? "mock" : "live") !== DATA_MODE)
      throw new Error("後端環境已改變，已停止送出。請確認環境設定後重新載入。");
  }
  const research = useMutation({
    mutationFn: async () => {
      await assertWrite();
      const currentProfile = await api.profile();
      client.setQueryData(["profile"], currentProfile);
      if (!hardMatches(input, currentProfile.hardConstraints))
        throw new Error("硬性限制已變更。請先取得重新篩選的資料。");
      const result = await api.research(input);
      return retain(result, input, currentProfile);
    },
    onSuccess: (s) => {
      const openResult = () => navigate(`/?snapshot=${s.id}`);
      if (
        currentPath.current === "/" &&
        !document.querySelector('[role="dialog"]')
      )
        openResult();
      toast.success(`研究完成，共 ${s.result.top.length} 檔可發布結果`, {
        action: { label: "查看研究", onClick: openResult },
      });
    },
  });
  const daily = useMutation({
    mutationFn: async (force: boolean) => {
      await assertWrite();
      if (!profile.data || !loaded)
        throw new Error("偏好與本機紀錄仍在載入，請稍後再開始每日研究。");
      const response = await api.daily(force);
      const output = response.screeningOutput
        ? parseScreening(response.screeningOutput)
        : undefined;
      if (output) setInput(output);
      const snapshot =
        output && response.result
          ? await retain(
              {
                ...response.result,
                screeningRunId: output.run.runId,
                dataVersion: output.run.dataVersion,
                sourceSnapshot: output.run.sourceSnapshot,
                personalization: {
                  userId: profile.data.userId,
                  softPreferences: WeightsSchema.parse(
                    output.run.profile.weights,
                  ),
                },
              },
              output,
            )
          : undefined;
      return { ...response, snapshot };
    },
    onSuccess: async (r) => {
      await sync();
      if (r.snapshot) {
        const snapshot = r.snapshot;
        const openResult = () => navigate(`/?snapshot=${snapshot.id}`);
        if (
          currentPath.current === "/" &&
          !document.querySelector('[role="dialog"]')
        )
          openResult();
        else
          toast.success("每日研究已完成", {
            action: { label: "查看研究", onClick: openResult },
          });
      }
    },
    onError: () => {
      void sync();
    },
  });
  const readNotice = useMutation({
    mutationFn: async (id: string) => {
      await assertWrite();
      return api.readNotice(id);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  async function openNotice(item: Notice) {
    try {
      if (!item.readAt) await readNotice.mutateAsync(item.notificationId);
    } catch {
      toast.error("未能標記已讀，仍可查看相關紀錄。");
    }
    if (item.thesisId)
      navigate(`/watchlist?thesis=${encodeURIComponent(item.thesisId)}`);
    else if (item.researchRunId)
      navigate(`/runs/${encodeURIComponent(item.researchRunId)}`);
    else
      navigate(
        `/activity?delivery=${encodeURIComponent(item.screeningRunId || "")}`,
      );
  }
  useEffect(() => {
    if (!desktopEnabled || noticePermission !== "granted" || !canWrite) return;
    let shown: string[];
    try {
      shown = JSON.parse(storage.read("shown-notices") || "[]");
    } catch {
      shown = [];
    }
    for (const notice of notifications.data?.notifications || []) {
      if (notice.readAt || shown.includes(notice.notificationId)) continue;
      shown.push(notice.notificationId);
      // Persist before displaying so polling and refresh cannot replay a notice.
      if (!storage.write("shown-notices", JSON.stringify(shown.slice(-1000)))) {
        setDesktopEnabled(false);
        toast.error("瀏覽器無法保存通知去重紀錄，已暫停桌面通知。");
        break;
      }
      try {
        const notification = new Notification(notice.title, {
          body: notice.message,
          tag: `${SCOPE}|${notice.notificationId}`,
        });
        notification.onclick = () => {
          window.focus();
          void openNotice(notice);
          notification.close();
        };
      } catch {
        setDesktopEnabled(false);
      }
    }
    // Do not mark as read on display or close on the next poll.
  }, [notifications.data, desktopEnabled, noticePermission, canWrite]);
  async function enableDesktop() {
    if (typeof Notification === "undefined") return;
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      toast.error("無法要求通知權限，可繼續使用站內通知。");
      return;
    }
    setNoticePermission(permission);
    setDesktopEnabled(permission === "granted");
    storage.write(
      "desktop-notifications",
      permission === "granted" ? "yes" : "no",
    );
  }
  function disableDesktop() {
    setDesktopEnabled(false);
    storage.write("desktop-notifications", "no");
  }
  return {
    health,
    admin,
    profile,
    notifications,
    detectedMode,
    canWrite,
    input,
    setInput,
    snapshots,
    loaded,
    cacheError,
    research,
    daily,
    sync,
    assertWrite,
    readNotice,
    openNotice,
    enableDesktop,
    disableDesktop,
    desktopEnabled,
    noticePermission,
  };
}
export type AppState = ReturnType<typeof useAppState>;
export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
