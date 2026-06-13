import { useEffect, useState } from "react";
import { api, type Me } from "./api";
import { navigate, type Route, useRoute } from "./useRoute";
import { Challenge } from "./views/Challenge";
import { CreateQuiz } from "./views/CreateQuiz";
import { Login } from "./views/Login";
import { MyQuizzes } from "./views/MyQuizzes";
import { Settings } from "./views/Settings";
import { Timeline } from "./views/Timeline";

export function App() {
  const route = useRoute();
  const [user, setUser] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  const logout = async () => {
    await api.logout();
    setUser(null);
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
    case "challenge":
      return <Challenge quizId={route.quizId} />;
    case "settings":
      return <Settings />;
    case "timeline":
      return <Timeline />;
  }
}
