import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Frontend rendering error", error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main style={{ padding: 40, maxWidth: 700 }}>
        <h1>畫面暫時無法載入</h1>
        <p>
          本機研究紀錄仍保留。請重新整理；若問題持續，請確認前後端版本與資料契約。
        </p>
        <button onClick={() => window.location.reload()}>重新整理</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
