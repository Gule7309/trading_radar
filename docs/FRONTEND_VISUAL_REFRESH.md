# 色彩與閱讀層級重整

2026-10-13（Asia/Taipei）。使用者同意依競品研究嘗試修改，沿用 `frontend-design` 的設計流程。設計目標是協助投資人辨認「能操作的項目、自己的收藏、研究證據與需重新評估的風險」。

## 設計依據

- [TradingView Screener](https://www.tradingview.com/support/solutions/43000718866-tradingview-stock-screener-trade-smarter-not-harder/)：官方截圖以中性色組織表格、欄位及篩選條件，操作使用藍色。借鏡層級與空間分配。
- [Koyfin Watchlist Views](https://www.koyfin.com/help/my-views/)：借鏡資料表優先的研究工作區。官方截圖屬該說明頁版本，不宣稱與登入後最新版完全相同。
- [Koyfin 主題說明](https://www.koyfin.com/help/theme-update-light-and-dark-modes-in-koyfin/)：官方提供 Light／Dark，Light 為預設；本案維持淺色閱讀，沒有為金融風格強制改黑底。
- [W3C 色彩使用原則](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)：狀態仍有文字與圖示，不僅依靠色彩。

以上是產品參考與設計判斷，不是淺色或藍色能提高投資績效的研究證據。

## 已實作

| 語意 | 表現 |
| --- | --- |
| 閱讀內容 | 冷灰 `#F5F7FA` 畫布、白色內容區、墨色 `#182230` 文字、次要文字 `#526173`。 |
| 操作／選取 | 深藍 `#2457C5`；hover `#19449F`；選取背景 `#EDF3FF`。候選選取另保留 checkbox 與左側線條。 |
| 品牌 | 雷達標誌保留 `#136B60`，不再用品牌色為所有內容著色。 |
| 證據支持／成功 | 綠色 `#176B52`，搭配原狀態文字及圖示。發布資格使用藍色。 |
| 收藏／追蹤中 | 中性標籤、書籤圖示；筆記採白底細框，避免看起來像系統認證。 |
| 削弱／需注意 | 琥珀色 `#8A5700`；追蹤變化區顯示淡琥珀底、左線及後端狀態文字。 |
| 失效／衝突／錯誤 | 紅色 `#B42318`；失效追蹤區使用淡紅底及明確標籤。 |

研究字體沿用 Microsoft JhengHei／PingFang TC／Segoe UI 與等寬數字；文字靠左、表格數值靠右。主色更換沒有引入新字型下載或裝飾圖表。

此段為配色調整階段的紀錄；後續使用者指定 Apple design 的字體優先順序更新如下。

追蹤說明與論點事件摘要屬自由文字：已知初始訊息沿用中文對照，其餘保留原文，不再套用 enum 的「未識別」前綴；未知狀態代碼仍保留原本的提示。

選股頁收緊環境列、頁首、日期與搜尋區間距，讓資料列更早出現在首屏。研究總覽將「目前研究論點」前移，保留量化數據、風險摘要及完整查證入口。四欄量化表的分隔線依桌面四欄／手機兩欄正確排列。

設計複查後保留品牌綠、把收藏與發布資格從支持狀態分離；沒有把所有淡綠區塊直接換成淡藍卡片。Mock 說明、追蹤中與筆記使用中性色，風險區才使用提醒底色。

## 驗證範圍

最終 TypeScript／production build 通過。實際操作候選比較 → 量化來源 → 返回比較 → 個股研究 → 證據分頁；320、390、768、1024、1440 px 的候選及研究頁沒有頁面水平溢出，JavaScript page error 為零。

axe-core 掃描 WCAG 2 A/AA + 2.1 A/AA 共 14 個狀態，0 violations：桌面候選、比較按鈕 hover、比較面板、量化來源、研究總覽、證據分頁、手機候選、手機研究、4 種追蹤狀態、手機失效論點、已收藏標籤。手機追蹤也沒有水平溢出。這不代表實體裝置或螢幕閱讀器已完整驗收。

此輪透過頁面正常執行一次 mock 研究，以取得研究畫面；沒有新增收藏或提交偏好回饋。追蹤狀態與收藏標籤使用瀏覽器 GET response 測試替身，資料明示 `[UI 視覺測試]`，不寫後端。測試結束移除替身並重新載入首頁。

本機驗證腳本與截圖：`output/playwright/palette-*`（Git 忽略）。這次屬前端呈現調整，未重做後端 API 全流程測試；既有整合證據見 [驗收紀錄](FRONTEND_VALIDATION.md)。

## Apple design 視覺精修（同日後續）

使用者明確指定 `C:/Users/apple/.codex/skills/apple-design/SKILL.md`。依其 typography、materials、response、spatial consistency 與 accessibility 原則落地：

- 優先使用 Apple system／Segoe UI 系統字體，中文 fallback 保留 PingFang TC／Microsoft JhengHei；保留 tabular numbers，加入 optical sizing，所有 CSS 字級改為 rem。中文標題字距略收，正文接近零字距，以字重、行高搭配尺寸形成層級。
- 候選／發布研究與追蹤範圍採分段選擇器；中性底搭配白色選取面、文字與 aria-pressed。側欄選取也採白色表面，維持藍色操作語意。
- 控制項、主要內容、浮層分別使用 0.625rem／1rem／1.25rem 圓角與不同陰影強度；資料表保留細分隔線，模態面板裁切圓角內的捲動內容。
- 手機 sticky 導覽與浮動比較列使用高不透明度霧面材質（18px／16px blur），正文維持白色實底。不支援 backdrop-filter 時沿用實色；減少透明度、高對比時移除 blur、提高結構邊界清晰度。
- 按壓從 pointer-down 即時回饋，80ms 收至 0.98；功能仍在正常 click 提交。面板以短淡入與 0.985 縮放區分前景；抽屜沿同一方向進出。這一版沒有拖曳需求，未增加 spring 套件或手勢操作。
- 減少動態時取消縮放／位移；保留鍵盤焦點、Escape 返回、選取文字與圖示。主要按鈕與關閉鈕至少 44px。

複查截圖後，保留霧面材質在真正浮於內容上方的工具列，避免透明正文或大面積動態。修正 200% 字級下日期列換行與減少動態時按壓 CSS specificity，確保設定確實生效。

### 精修驗證

- TypeScript／production build 通過。比較 → 來源 → 個股 → 查證流程正常，JavaScript page error 為零。
- 320、390、768、1024、1440 px 的候選與研究頁均無水平溢出。另以 320／390／1440 px、根字級 32px 模擬 200% 文字放大，沒有頁面水平溢出；不等同已驗證所有瀏覽器原生縮放或實體裝置。
- axe-core WCAG 2 A/AA + 2.1 A/AA 共 11 個狀態為 0 violations：8 個主要研究狀態，以及手機大字、高對比和偏好頁。
- 鍵盤 Enter 開啟比較、Tab 留在面板、Escape 返回比較按鈕；手機導覽跳轉後收起，皆通過。
- 瀏覽器媒體偏好模擬：一般狀態 blur 為 18px／16px，減少透明度或高對比時為 none；減少動態時 transition 為 0.01ms，按壓 transform 為 none。測試完成還原偏好。

截圖與腳本為 `output/playwright/apple-*`。本輪未新增研究或寫入收藏／回饋，未更動後端契約。
