import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent unhandled errors from causing silent white screens on iOS
window.addEventListener("error", (e) => {
  console.error("[GlobalError]", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[UnhandledRejection]", e.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
