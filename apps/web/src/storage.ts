import { get, set } from "idb-keyval";
import { BatchSchema, WeightsSchema, type Snapshot } from "./contracts";
import { SCOPE } from "./api";
import { parseScreening } from "./data";

export const storage = {
  read(key: string) {
    try {
      return localStorage.getItem(`${SCOPE}|${key}`);
    } catch {
      return null;
    }
  },
  write(key: string, value: string) {
    try {
      localStorage.setItem(`${SCOPE}|${key}`, value);
      return true;
    } catch {
      return false;
    }
  },
};
export async function loadSnapshots(): Promise<Snapshot[]> {
  const items = (await get<Snapshot[]>(`research|${SCOPE}`)) || [];
  if (!Array.isArray(items)) throw new Error("Invalid archive");
  return items
    .filter((s) => s.scope === SCOPE)
    .map((s) => {
      if (typeof s.id !== "string" || typeof s.createdAt !== "string")
        throw new Error("Invalid archive");
      return {
        ...s,
        input: parseScreening(s.input),
        result: BatchSchema.parse(s.result),
        weights: WeightsSchema.parse(s.weights),
      };
    });
}
export async function storeSnapshots(snapshots: Snapshot[]) {
  await set(`research|${SCOPE}`, snapshots.slice(0, 30));
}
