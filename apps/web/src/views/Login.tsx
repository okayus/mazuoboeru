const ERROR_MESSAGES: Record<string, string> = {
  email_unverified:
    "プロバイダのメールが未検証のためログインできません。プロバイダ側でメールを確認してから再度お試しください。",
  provider_unconfigured: "このプロバイダは未設定です（dev クライアント未設定）。",
  invalid_state: "セッションが切れました。もう一度お試しください。",
  oauth_failed: "認証に失敗しました。もう一度お試しください。",
};

export function Login() {
  const params = new URLSearchParams(window.location.search);
  const err = params.get("auth_error");

  return (
    <div className="card">
      <h2>ログイン</h2>
      {err ? <p className="error">{ERROR_MESSAGES[err] ?? `エラー: ${err}`}</p> : null}
      <p>クイズの作成・挑戦にはログインが必要です。</p>
      <div className="btn-row">
        <a className="btn" href="/auth/google">
          Google でログイン
        </a>
        <a className="btn" href="/auth/github">
          GitHub でログイン
        </a>
      </div>
    </div>
  );
}
