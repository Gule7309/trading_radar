import type { ScreeningOutputV1 } from "../domain/screening-output.js";
import type { UserProfile } from "../personalization/types.js";

export interface ScreeningProvider {
  screen(
    profile: UserProfile,
    options?: {
      limit?: number;
      asOfDate?: string;
    },
  ): Promise<ScreeningOutputV1>;

  inspectTicker(
    profile: UserProfile,
    ticker: string,
    options?: {
      asOfDate?: string;
    },
  ): Promise<ScreeningOutputV1>;
}
