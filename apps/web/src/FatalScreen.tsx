// main.tsx renders this from onUncaughtError, in place of the app React unmounted.
// It must not throw in its turn, hence no state, no fetch and no props.
export function FatalScreen() {
  return (
    <div className="app">
      <main>
        <div className="card">
          <div role="alert">
            <h2>表示できませんでした</h2>
            <p>再読み込みすると直ることがあります。</p>
          </div>
          <button type="button" onClick={() => location.reload()}>
            再読み込み
          </button>
        </div>
      </main>
    </div>
  );
}
