import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FatalScreen } from "./FatalScreen";
import "./index.css";

const root = createRoot(document.getElementById("root")!, {
  // React 19 calls this once it has unmounted the whole tree over an error that no
  // boundary caught, and the app has no boundary. It replaces the default handler,
  // so reportError keeps the error on the console and in the window "error" event.
  onUncaughtError(error) {
    reportError(error);
    root.render(<FatalScreen />);
  },
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
