import { describe, expect, it } from "vitest";
import {
  normalizeAnnouncementTime,
  normalizeMaterialDisclosureRow,
} from "../src/tools/official/material-disclosure.js";

describe("material disclosure normalization", () => {
  it("normalizes an announcement time", () => {
    expect(normalizeAnnouncementTime("54626")).toBe("05:46:26");
    expect(normalizeAnnouncementTime("152504")).toBe("15:25:04");
  });

  it("normalizes a TWSE material disclosure row including subject whitespace", () => {
    const record = normalizeMaterialDisclosureRow("TWSE", {
      公司代號: "2330",
      公司名稱: "測試公司",
      出表日期: "1151007",
      發言日期: "1151006",
      發言時間: "152504",
      "主旨 ": "公告重大訊息",
      符合條款: "第51款",
      事實發生日: "1151006",
      說明: "事件內容",
    });

    expect(record).toMatchObject({
      market: "TWSE",
      ticker: "2330",
      companyName: "測試公司",
      tableDate: "2026-10-07",
      announcementDate: "2026-10-06",
      announcementTime: "15:25:04",
      occurredAt: "2026-10-06",
      subject: "公告重大訊息",
      clause: "第51款",
      description: "事件內容",
    });
  });
});
