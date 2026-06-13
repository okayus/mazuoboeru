import { useEffect, useState } from "react";
import { api, type CreatedToken, isApiError, type TokenSummary } from "../api";

export function Settings() {
  const [tokens, setTokens] = useState<TokenSummary[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const load = () => {
    api
      .listTokens()
      .then((r) => setTokens(r.tokens))
      .catch((e) => {
        if (isApiError(e) && e.status === 401) setNeedLogin(true);
        else setError("読み込みに失敗しました");
      });
  };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      const r = await api.createToken(name.trim());
      setCreated(r.token);
      setName("");
      load();
    } catch {
      setError("発行に失敗しました");
    }
  };

  const revoke = async (id: string) => {
    await api.revokeToken(id);
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
      <h2>PAT（API トークン）</h2>
      <p className="meta">
        CLI / AI エージェントが API を叩くための Bearer トークンです。発行直後の一度だけ表示されます。
      </p>

      <div className="card">
        <input
          placeholder="トークン名（例: claude-laptop）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={create} disabled={!name.trim()}>
          発行
        </button>
      </div>

      {created ? (
        <div className="card token-once">
          <strong>{created.name} を発行しました。今だけ表示されます:</strong>
          <code className="token">{created.token}</code>
          <p className="meta">スコープ: {created.scopes.join(", ")}</p>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {!tokens ? (
        <p>読み込み中…</p>
      ) : tokens.length === 0 ? (
        <p>まだトークンはありません。</p>
      ) : (
        <table className="tokens">
          <thead>
            <tr>
              <th>名前</th>
              <th>作成</th>
              <th>最終使用</th>
              <th>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : "—"}</td>
                <td>{t.revokedAt ? "失効済み" : "有効"}</td>
                <td>
                  {t.revokedAt ? null : (
                    <button className="link" onClick={() => revoke(t.id)}>
                      失効
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
