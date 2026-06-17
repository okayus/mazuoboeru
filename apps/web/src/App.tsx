import useSWR from "swr";
import { api } from "./api";
import { navigate, type Route, useRoute } from "./useRoute";
import { Challenge } from "./views/Challenge";
import { CreateQuiz } from "./views/CreateQuiz";
import { Dashboard } from "./views/Dashboard";
import { Login } from "./views/Login";
import { MyHot } from "./views/MyHot";
import { MyQuizzes } from "./views/MyQuizzes";
import { Settings } from "./views/Settings";
import { Timeline } from "./views/Timeline";

export function App() {
  const route = useRoute();
  // Auth state lives in SWR's cache (key "auth/me") so it's deduped/shared and
  // revalidates on focus. me() returns {user:null} when logged out (it doesn't
  // throw), so `data === undefined` is the only "still loading" signal.
  const { data, mutate } = useSWR("auth/me", () => api.me());
  const user = data?.user ?? null;
  const loaded = data !== undefined;

  const logout = async () => {
    await api.logout();
    mutate({ user: null }, { revalidate: false });
    navigate("/");
  };

  return (
    <div className="app">
      <header>
        <a href="#/" className="brand">
          まず覚える
        </a>
        <nav>
          <a href="#/">タイムライン</a>
          {user ? <a href="#/mine">マイクイズ</a> : null}
          {user ? <a href="#/dashboard">ダッシュボード</a> : null}
          {user ? <a href="#/favorites">my hot</a> : null}
          {user ? <a href="#/create">作る</a> : null}
          {user ? <a href="#/settings">PAT</a> : null}
          {!loaded ? null : user ? (
            <span className="user">
              {user.displayName}
              <button className="link" onClick={logout}>
                ログアウト
              </button>
            </span>
          ) : (
            <a href="#/login">ログイン</a>
          )}
        </nav>
      </header>
      <main>
        <View route={route} />
      </main>
    </div>
  );
}

function View({ route }: { route: Route }) {
  switch (route.name) {
    case "login":
      return <Login />;
    case "create":
      return <CreateQuiz />;
    case "mine":
      return <MyQuizzes />;
    case "dashboard":
      return <Dashboard />;
    case "favorites":
      return <MyHot />;
    case "challenge":
      return <Challenge quizId={route.quizId} />;
    case "settings":
      return <Settings />;
    case "timeline":
      return <Timeline />;
  }
}
