import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  Bell,
  Bookmark,
  Menu,
  Radar,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useApp } from "./context-store";
import { DATA_MODE } from "./api";
import s from "./app.module.css";

const Research = lazy(() =>
  import("./Research").then((m) => ({ default: m.Research })),
);
const RunPage = lazy(() =>
  import("./Research").then((m) => ({ default: m.RunPage })),
);
const Watchlist = lazy(() =>
  import("./Watchlist").then((m) => ({ default: m.Watchlist })),
);
const Preferences = lazy(() =>
  import("./Preferences").then((m) => ({ default: m.Preferences })),
);
const Activity = lazy(() =>
  import("./Secondary").then((m) => ({ default: m.Activity })),
);
const Notifications = lazy(() =>
  import("./Secondary").then((m) => ({ default: m.Notifications })),
);
const System = lazy(() =>
  import("./Secondary").then((m) => ({ default: m.System })),
);

const DesignQA = import.meta.env.DEV
  ? lazy(() => import("./DesignQA").then((m) => ({ default: m.DesignQA })))
  : null;

export function App() {
  const app = useApp();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const unread =
    app.notifications.data?.notifications.filter((n) => !n.readAt).length || 0;
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  const nav = [
    { to: "/", title: "選股研究", icon: Radar },
    { to: "/watchlist", title: "追蹤清單", icon: Bookmark },
    { to: "/notifications", title: "通知", icon: Bell },
    { to: "/preferences", title: "研究偏好", icon: SlidersHorizontal },
    { to: "/activity", title: "執行紀錄", icon: ActivityIcon },
    { to: "/system", title: "系統狀態", icon: Settings2 },
  ];
  return (
    <div className={s.app}>
      <a href="#main" className={s.skipLink}>
        跳到主要內容
      </a>
      <aside className={`${s.sidebar} ${menuOpen ? s.menuOpen : ""}`}>
        <div className={s.brand}>
          <Radar size={29} strokeWidth={1.6} />
          <div>
            <strong>股研雷達</strong>
            <span>NAPAI 台股研究</span>
          </div>
          <button
            className={`${s.iconButton} ${s.menuButton}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? "收起導覽" : "展開導覽"}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        <nav id="primary-nav" className={s.navigation} aria-label="主要導覽">
          {nav.map(({ to, title, icon: Icon }, i) => (
            <NavLink
              end={to === "/"}
              key={to}
              to={to}
              className={({ isActive }) =>
                `${s.navItem} ${isActive ? s.activeNav : ""} ${i === 3 ? s.secondaryNav : ""}`
              }
            >
              <Icon size={19} />
              <span>{title}</span>
              {to === "/notifications" && unread > 0 && (
                <small className={s.count}>{unread}</small>
              )}
            </NavLink>
          ))}
        </nav>
        <div className={s.sidebarFooter}>
          <span className={s.connectionDot} />
          <span>{app.canWrite ? "研究服務已連線" : "研究服務尚未就緒"}</span>
          <p>查證依據，持續追蹤。</p>
          <small>
            demo-user · {DATA_MODE === "mock" ? "開發示範" : "真實環境"}
          </small>
        </div>
      </aside>
      <div className={s.mainColumn}>
        <div className={s.environmentBar}>
          <span>
            <span className={s.modeLabel}>
              {app.detectedMode === "mock"
                ? "Mock 示範環境"
                : app.detectedMode === "live"
                  ? "真實研究環境"
                  : "正在連線"}
            </span>
            {app.detectedMode === "mock"
              ? "研究為模擬內容，量化數據依標示期間提供。"
              : "研究內容供查證與追蹤，請確認資料期間與原始來源。"}
          </span>
          <Link to="/system">系統狀態</Link>
        </div>
        {app.health.isError ||
        (app.detectedMode && app.detectedMode !== DATA_MODE) ? (
          <div className={s.error} role="alert">
            {app.health.isError
              ? "無法連上研究服務，請確認後端與 CORS 設定。"
              : `前後端環境不一致（${DATA_MODE} / ${app.detectedMode}），已停止寫入。`}
            <Link to="/system">檢查連線</Link>
          </div>
        ) : null}
        <main id="main" className={s.main} tabIndex={-1}>
          <Suspense fallback={<p role="status">正在載入頁面…</p>}>
            <Routes>
              <Route path="/" element={<Research />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/preferences" element={<Preferences />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/system" element={<System />} />
              <Route path="/runs/:runId" element={<RunPage />} />
              {DesignQA && <Route path="/design-qa" element={<DesignQA />} />}
              <Route
                path="*"
                element={
                  <>
                    <h1>找不到這個頁面</h1>
                    <Link to="/">返回選股研究</Link>
                  </>
                }
              />
            </Routes>
          </Suspense>
          <footer className={s.pageFooter}>
            資料與研究狀態由後端提供。查證支持程度不代表投資安全。
            <span>時間以 Asia/Taipei 顯示</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
