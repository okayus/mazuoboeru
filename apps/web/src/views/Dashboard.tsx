import useSWR from "swr";
import { api, isApiError } from "../api";

const pct = (correct: number, total: number): string =>
  total === 0 ? "—" : `${Math.round((correct / total) * 100)}%`;

export function Dashboard() {
  // Private to the caller; don't retry on the 401 (logged-out).
  const { data, error } = useSWR("dashboard", () => api.dashboard(), {
    shouldRetryOnError: false,
  });

  if (isApiError(error) && error.status === 401)
    return (
      <p>
        ダッシュボードには <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;

  return (
    <div>
      <h2>学習ダッシュボード</h2>
      {data.overall.total === 0 ? (
        <p>
          まだ回答がありません。クイズに挑戦すると、ここに正答率・連続記録・タグ別の成績が出ます。
        </p>
      ) : (
        <>
          <div className="card">
            <p>
              これまでの平均正答率:{" "}
              <strong>{pct(data.overall.correct, data.overall.total)}</strong>（
              {data.overall.correct} / {data.overall.total} 問）
            </p>
            <p>
              連続学習: <strong>{data.streak.current}</strong> 日（最長 {data.streak.longest} 日）
            </p>
            <p className="meta">挑戦したクイズ: {data.quizzesAttempted} 件</p>
          </div>

          <h3>タグ別の正答率</h3>
          {data.tags.length === 0 && data.untagged.total === 0 ? (
            <p className="meta">タグ付きのクイズに挑戦すると、タグ別の成績が出ます。</p>
          ) : (
            <ul className="quiz-list">
              {data.tags.map((t) => (
                <li key={t.name} className="card">
                  <strong>{t.name}</strong>: {pct(t.correct, t.total)}（{t.correct} / {t.total}）
                </li>
              ))}
              {data.untagged.total > 0 ? (
                <li className="card">
                  <span className="meta">タグなし</span>: {pct(data.untagged.correct, data.untagged.total)}（
                  {data.untagged.correct} / {data.untagged.total}）
                </li>
              ) : null}
            </ul>
          )}
          <p className="meta">
            ※ 再挑戦も含むこれまでの全回答での平均（活動量ベース）。成績は本人にのみ表示されます。
          </p>
        </>
      )}
    </div>
  );
}
