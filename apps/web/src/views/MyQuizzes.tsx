import { useState } from "react";
import useSWR from "swr";
import { api, isApiError } from "../api";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  hidden: "非表示",
};

export function MyQuizzes() {
  // Auth-gated read: don't retry on the 401 (shouldRetryOnError: false).
  const { data, error, mutate } = useSWR("quizzes/mine", () => api.myQuizzes(), {
    shouldRetryOnError: false,
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const needLogin = isApiError(error) && error.status === 401;

  const publish = async (id: string) => {
    setActionError(null);
    try {
      await api.publishQuiz(id);
      mutate();
    } catch (e) {
      setActionError(
        isApiError(e) && e.status === 422
          ? "公開できません: 設問・選択肢・正解の条件を満たしていません。"
          : "公開に失敗しました",
      );
    }
  };

  const del = async (id: string) => {
    await api.deleteQuiz(id);
    mutate();
  };

  if (needLogin)
    return (
      <p>
        この画面には <a href="#/login">ログイン</a> が必要です。
      </p>
    );

  const items = data?.quizzes;
  const errMsg = actionError ?? (error ? "読み込みに失敗しました" : null);

  return (
    <div>
      <h2>マイクイズ</h2>
      <p>
        <a className="btn" href="#/create">
          ＋ 新しいクイズを作る
        </a>
      </p>
      {errMsg ? <p className="error">{errMsg}</p> : null}
      {error ? null : !items ? (
        <p>読み込み中…</p>
      ) : items.length === 0 ? (
        <p>まだクイズがありません。</p>
      ) : (
        <ul className="quiz-list">
          {items.map((q) => (
            <li key={q.id} className="card">
              <div className="q-head">
                <strong>{q.title || "（無題）"}</strong>
                <span className="badge">{STATUS_LABEL[q.status] ?? q.status}</span>
              </div>
              <div className="btn-row">
                {q.status === "draft" ? (
                  <button onClick={() => publish(q.id)}>公開する</button>
                ) : null}
                {q.status === "published" ? (
                  <a className="btn" href={`#/quiz/${q.id}`}>
                    挑戦画面を見る
                  </a>
                ) : null}
                <button className="link" onClick={() => del(q.id)}>
                  削除
                </button>
              </div>
              <TagEditor quizId={q.id} initial={q.tags} onSaved={() => mutate()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Inline per-quiz tag editor. Tags are quiz-level metadata, editable on any status
// (ADR-0002), so this is also how existing/published quizzes get tagged.
function TagEditor({
  quizId,
  initial,
  onSaved,
}: {
  quizId: string;
  initial: string[];
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial.join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const list = value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      const { tags } = await api.setQuizTags(quizId, list);
      setValue(tags.join(", "));
      onSaved();
    } catch {
      setErr("タグの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field tag-editor">
      <span>タグ（カンマ/スペース区切り・最大5）</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="例: Docker, ネットワーク" />
      <button className="link" onClick={save} disabled={busy}>
        {busy ? "保存中…" : "タグを保存"}
      </button>
      {err ? <p className="error">{err}</p> : null}
    </div>
  );
}
