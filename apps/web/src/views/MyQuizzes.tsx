import { useEffect, useState } from "react";
import { api, type AuthorQuizSummary, isApiError } from "../api";

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  hidden: "非表示",
};

export function MyQuizzes() {
  const [items, setItems] = useState<AuthorQuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const load = () => {
    api
      .myQuizzes()
      .then((r) => setItems(r.quizzes))
      .catch((e) => {
        if (isApiError(e) && e.status === 401) setNeedLogin(true);
        else setError("読み込みに失敗しました");
      });
  };
  useEffect(load, []);

  const publish = async (id: string) => {
    setError(null);
    try {
      await api.publishQuiz(id);
      load();
    } catch (e) {
      if (isApiError(e) && e.status === 422) {
        setError("公開できません: 設問・選択肢・正解の条件を満たしていません。");
      } else {
        setError("公開に失敗しました");
      }
    }
  };

  const del = async (id: string) => {
    await api.deleteQuiz(id);
    load();
  };

  if (needLogin)
    return (
      <p>
        この画面には <a href="#/login">ログイン</a> が必要です。
      </p>
    );

  return (
    <div>
      <h2>マイクイズ</h2>
      <p>
        <a className="btn" href="#/create">
          ＋ 新しいクイズを作る
        </a>
      </p>
      {error ? <p className="error">{error}</p> : null}
      {!items ? (
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
