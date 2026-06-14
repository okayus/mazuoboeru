import { useState } from "react";
import { api, isApiError, type ReportReason, type ReportTargetType } from "../api";

// Labels are the single UI mapping of the server's reason categories (worker
// domain/report.ts). Keep the `value`s in sync with REPORT_REASON_CATEGORIES.
const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "スパム・宣伝" },
  { value: "sexual", label: "性的・わいせつ" },
  { value: "violence", label: "暴力・ハラスメント" },
  { value: "copyright", label: "著作権侵害" },
  { value: "other", label: "その他" },
];

const REASON_MAX = 500;

// Reusable report control for any target (quiz / question / user). Collapsed to a
// quiet link until opened; on success it replaces itself with a thank-you so the
// same target can't be re-reported in the same view (the server is idempotent too).
export function ReportButton({
  targetType,
  targetId,
  label = "通報",
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const trimmed = text.trim();
      // Omit reasonText entirely when blank (exactOptionalPropertyTypes: no explicit undefined).
      await api.report({
        targetType,
        targetId,
        reasonCategory: reason,
        ...(trimmed ? { reasonText: trimmed } : {}),
      });
      setDone(true);
    } catch (e) {
      if (isApiError(e) && e.status === 429) {
        setError("本日の通報上限に達しました。時間をおいて再度お試しください。");
      } else if (isApiError(e) && e.status === 401) {
        setError("通報するにはログインが必要です。");
      } else if (isApiError(e) && e.status === 404) {
        setError("対象が見つかりませんでした。");
      } else {
        setError("通報の送信に失敗しました。");
      }
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return <p className="report-done">通報を受け付けました。ご協力ありがとうございます。</p>;
  }

  if (!open) {
    return (
      <button type="button" className="link report-open" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="report-form card">
      <strong>このコンテンツを通報</strong>
      <label className="field">
        <span>理由</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>詳細（任意・最大{REASON_MAX}文字）</span>
        <textarea
          value={text}
          maxLength={REASON_MAX}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          placeholder="補足があれば記入してください"
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="btn-row">
        <button type="button" onClick={submit} disabled={sending}>
          {sending ? "送信中…" : "通報する"}
        </button>
        <button type="button" className="link" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
