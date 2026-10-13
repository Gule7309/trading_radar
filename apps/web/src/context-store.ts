import { createContext, useContext } from "react";
import type { AppState } from "./context";

export const Context = createContext<AppState | null>(null);
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("AppProvider missing");
  return context;
}
