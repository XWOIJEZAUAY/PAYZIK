import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { hydrateBackend } from "./services/backend/supabase";
import "./index.css";

async function bootstrap() {
  // Les données cloud sont chargées avant le premier rendu : les hooks
  // localStorage de l'app démarrent donc directement avec le bon état.
  await hydrateBackend();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    });
  }
}

void bootstrap();
