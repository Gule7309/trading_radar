import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "./api";
import { useApp } from "./context-store";
import type { Profile } from "./contracts";
import { date, label, sample } from "./data";
import {
  ErrorBox,
  JsonDetails,
  Loading,
  Modal,
  PageHeading,
  WeightsView,
} from "./ui";
import s from "./app.module.css";

function ProfileForm({ profile }: { profile: Profile }) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(profile);
  const [advanced, setAdvanced] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      await app.assertWrite();
      const hard = draft.hardConstraints;
      if (
        (hard.maxDebtRatio != null && hard.maxDebtRatio <= 0) ||
        (hard.minLiquidity != null && hard.minLiquidity < 0)
      )
        throw new Error("負債比上限須大於 0%，流動性須為非負數。");
      if (
        advanced &&
        Object.values(draft.softPreferences).reduce((a, b) => a + b, 0) <= 0
      )
        throw new Error("研究權重總和必須大於零。");
      return api.updateProfile({
        investmentHorizon: draft.investmentHorizon,
        riskTolerance: draft.riskTolerance,
        researchStyle: draft.researchStyle,
        hardConstraints: {
          ...hard,
          excludedIndustries: [
            ...new Set(
              hard.excludedIndustries.map((x) => x.trim()).filter(Boolean),
            ),
          ],
        },
        ...(advanced ? { softPreferences: draft.softPreferences } : {}),
      });
    },
    onSuccess: async (updated) => {
      setDraft(updated);
      await app.sync();
      setSaved(true);
      toast.success("研究偏好已更新");
    },
  });
  const reset = useMutation({
    mutationFn: async () => {
      await app.assertWrite();
      return api.resetWeights();
    },
    onSuccess: async (updated) => {
      setDraft(updated);
      await app.sync();
      setResetOpen(false);
      toast.success("已重設研究權重，硬性限制保持不變");
    },
  });
  const industries = [
    ...new Set([
      ...sample.candidates
        .map((c) => c.industry)
        .filter((v): v is string => !!v),
      ...draft.hardConstraints.excludedIndustries,
    ]),
  ];
  const hard = draft.hardConstraints;
  return (
    <>
      <div className={s.paper}>
        <nav className={s.steps} aria-label="偏好設定步驟">
          {["研究習慣", "篩選限制", "確認設定"].map((text, i) => (
            <button
              key={text}
              className={step === i ? s.currentStep : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span>{i + 1}</span>
              {text}
            </button>
          ))}
        </nav>
        <form
          className={s.formBody}
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) setStep(step + 1);
            else mutation.mutate();
          }}
        >
          {step === 0 && (
            <>
              <h2>你習慣如何研究股票？</h2>
              <p className={s.muted}>設定會保存在後端，之後可以隨時調整。</p>
              <div className={s.formGrid}>
                <label className={s.field}>
                  投資期間
                  <select
                    value={draft.investmentHorizon}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        investmentHorizon: e.target
                          .value as Profile["investmentHorizon"],
                      })
                    }
                  >
                    <option value="SHORT">短期</option>
                    <option value="MEDIUM">中期</option>
                    <option value="LONG">長期</option>
                  </select>
                </label>
                <label className={s.field}>
                  波動接受度
                  <select
                    value={draft.riskTolerance}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        riskTolerance: e.target
                          .value as Profile["riskTolerance"],
                      })
                    }
                  >
                    <option value="LOW">較低</option>
                    <option value="MEDIUM">中等</option>
                    <option value="HIGH">較高</option>
                  </select>
                </label>
              </div>
              <fieldset className={s.styleChoices}>
                <legend>研究風格</legend>
                {(["GROWTH", "BALANCED", "STABLE"] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="style"
                      value={value}
                      checked={draft.researchStyle === value}
                      onChange={() =>
                        setDraft({ ...draft, researchStyle: value })
                      }
                    />
                    <strong>{label(value)}</strong>
                    <span>
                      {value === "GROWTH"
                        ? "偏重成長機會"
                        : value === "STABLE"
                          ? "偏重財務安全"
                          : "兼顧三項研究因素"}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className={s.hint}>
                期間與波動接受度會儲存於個人設定；目前排序 API
                使用三項研究權重，不額外推算未定義的期間或風險加分。
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <h2>哪些條件不能妥協？</h2>
              <p className={s.muted}>
                硬性限制只由你修改，收藏與略過不會放寬這些條件。
              </p>
              <div className={s.formGrid}>
                <label className={s.field}>
                  負債比上限（%）
                  <input
                    type="number"
                    min={0.000001}
                    step="any"
                    placeholder="不限"
                    value={hard.maxDebtRatio ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hardConstraints: {
                          ...hard,
                          maxDebtRatio:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                  <small>留空代表不限。</small>
                </label>
                <label className={s.field}>
                  20 日平均成交金額下限（新台幣元）
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="不限"
                    value={hard.minLiquidity ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        hardConstraints: {
                          ...hard,
                          minLiquidity:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                  <small>100,000,000 元 = 1 億元；留空代表不限。</small>
                </label>
              </div>
              <label className={s.checkLine}>
                <input
                  type="checkbox"
                  checked={hard.excludeDisposition}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      hardConstraints: {
                        ...hard,
                        excludeDisposition: e.target.checked,
                      },
                    })
                  }
                />
                排除處置股
              </label>
              <fieldset className={s.reasonChoices}>
                <legend>排除產業（可複選）</legend>
                {industries.map((industry) => (
                  <label key={industry}>
                    <input
                      type="checkbox"
                      checked={hard.excludedIndustries.includes(industry)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          hardConstraints: {
                            ...hard,
                            excludedIndustries: e.target.checked
                              ? [...hard.excludedIndustries, industry]
                              : hard.excludedIndustries.filter(
                                  (x) => x !== industry,
                                ),
                          },
                        })
                      }
                    />
                    {industry}
                  </label>
                ))}
              </fieldset>
              <label className={s.field}>
                其他排除產業（使用上游資料的正式名稱，每行一項）
                <textarea
                  rows={3}
                  value={hard.excludedIndustries
                    .filter(
                      (x) => !sample.candidates.some((c) => c.industry === x),
                    )
                    .join("\n")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      hardConstraints: {
                        ...hard,
                        excludedIndustries: [
                          ...hard.excludedIndustries.filter((x) =>
                            sample.candidates.some((c) => c.industry === x),
                          ),
                          ...e.target.value.split("\n"),
                        ],
                      },
                    })
                  }
                />
              </label>
              <p className={s.notice}>
                修改後必須重新取得篩選資料；前端不會自行刪除候選股來替代量化篩選。
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <h2>確認你的研究設定</h2>
              <dl className={s.definition}>
                <dt>研究習慣</dt>
                <dd>
                  {draft.investmentHorizon === "MEDIUM"
                    ? "中期"
                    : label(draft.investmentHorizon)}{" "}
                  / 波動接受度 {label(draft.riskTolerance)} /{" "}
                  {label(draft.researchStyle)}
                </dd>
                <dt>排除產業</dt>
                <dd>{hard.excludedIndustries.join("、") || "無"}</dd>
                <dt>負債比上限</dt>
                <dd>
                  {hard.maxDebtRatio == null ? "不限" : `${hard.maxDebtRatio}%`}
                </dd>
                <dt>成交金額下限</dt>
                <dd>
                  {hard.minLiquidity == null
                    ? "不限"
                    : `${hard.minLiquidity.toLocaleString()} 元`}
                </dd>
                <dt>處置股</dt>
                <dd>
                  {hard.excludeDisposition ? "排除" : "不排除（仍揭露旗標）"}
                </dd>
              </dl>
              <h3>可學習的研究偏好</h3>
              <p>
                目前後端權重如下。切換研究風格且未手動指定權重時，由後端套用該風格設定；回饋可逐步調整權重。
              </p>
              <WeightsView weights={profile.softPreferences} />
              <label className={s.checkLine}>
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => setAdvanced(e.target.checked)}
                />
                進階：手動指定三項相對權重
              </label>
              {advanced && (
                <div className={s.formGrid}>
                  {(["growth", "profitability", "safety"] as const).map(
                    (key) => (
                      <label key={key} className={s.field}>
                        {label(key)}
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step="any"
                          value={draft.softPreferences[key]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              softPreferences: {
                                ...draft.softPreferences,
                                [key]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                  <p className={s.hint}>
                    提交後由後端正規化；顯示結果以伺服器回傳為準。
                  </p>
                </div>
              )}
            </>
          )}
          <ErrorBox error={mutation.error || error} />
          {saved && (
            <div className={s.notice}>
              設定已儲存。<Link to="/">返回研究</Link>，使用新偏好開始下一輪。
            </div>
          )}
          <div className={s.formFooter}>
            {step > 0 ? (
              <button
                type="button"
                className={s.button}
                onClick={() => setStep(step - 1)}
              >
                上一步
              </button>
            ) : (
              <span />
            )}
            <button
              className={s.primary}
              disabled={mutation.isPending || !app.canWrite}
            >
              {mutation.isPending
                ? "正在儲存…"
                : step < 2
                  ? "下一步"
                  : "儲存研究偏好"}
            </button>
          </div>
        </form>
      </div>
      <div className={s.section}>
        <h2>研究權重</h2>
        <p>重設會回到目前研究風格的初始權重，保留所有硬性限制與歷史紀錄。</p>
        <button
          className={s.button}
          onClick={() => setResetOpen(true)}
          disabled={!app.canWrite}
        >
          重設研究權重
        </button>
        <button
          className={s.textButton}
          onClick={async () => {
            try {
              const data = await api.screeningProfile();
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "screening-profile.json";
              anchor.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              setError(e);
            }
          }}
        >
          下載給資料端的篩選設定
        </button>
      </div>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="重設研究權重"
        description="只重設三項軟性研究權重，不會刪除硬性限制、收藏或歷史回饋。"
      >
        <ErrorBox error={reset.error} />
        <button
          className={s.primary}
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
        >
          {reset.isPending ? "正在重設…" : "確認重設研究權重"}
        </button>
      </Modal>
    </>
  );
}

export function Preferences() {
  const app = useApp();
  const history = useQuery({
    queryKey: ["changes"],
    queryFn: api.changes,
    enabled: !!app.health.data?.personalization,
  });
  return (
    <>
      <PageHeading
        title="研究偏好"
        text="先定義研究習慣與不可妥協的條件，再讓回饋逐步調整研究方向。"
      />
      {app.health.data && !app.health.data.personalization && (
        <p className={s.notice}>目前後端未啟用個人偏好。</p>
      )}
      <ErrorBox
        error={app.profile.error}
        retry={() => void app.profile.refetch()}
      />
      {app.profile.isLoading && <Loading />}
      {app.profile.data && <ProfileForm profile={app.profile.data} />}
      <section className={s.section}>
        <h2>偏好變更歷史</h2>
        <ErrorBox error={history.error} />
        {history.isLoading && <Loading />}
        {history.data?.changes.length === 0 && (
          <p className={s.muted}>
            尚無變更。收藏、略過或手動調整後會留下紀錄。
          </p>
        )}
        {history.data?.changes.map((change) => (
          <article className={s.historyEntry} key={change.changeId}>
            <div className={s.sectionTitle}>
              <h3>{label(change.source)}</h3>
              <time>{date(change.createdAt)}</time>
            </div>
            <p>{change.reason}</p>
            <WeightsView weights={change.after} delta={change.delta} />
            <JsonDetails
              title="比較變更前後的實際權重"
              value={{
                before: change.before,
                after: change.after,
                delta: change.delta,
              }}
            />
          </article>
        ))}
      </section>
    </>
  );
}
