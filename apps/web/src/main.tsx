import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider } from "./context";
import { App } from "./App";
import "./global.css";
import { ErrorBoundary } from "./ErrorBoundary";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
document.addEventListener("keydown", () => {
  document.documentElement.dataset.keyboard = "true";
});
document.addEventListener("pointerdown", () => {
  delete document.documentElement.dataset.keyboard;
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ErrorBoundary>
          <AppProvider>
            <App />
            <Toaster position="bottom-right" closeButton richColors />
          </AppProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
