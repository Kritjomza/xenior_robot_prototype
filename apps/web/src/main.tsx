import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./auth/AuthGate";
import App from "./App";
import { setAccessToken } from "./api";
import "./styles.css";

const e2eToken =
  import.meta.env.MODE === "e2e"
    ? import.meta.env.VITE_E2E_TEST_TOKEN
    : undefined;
if (e2eToken) setAccessToken(e2eToken);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {e2eToken ? (
      <App e2eAutoUnlock />
    ) : (
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    )}
  </StrictMode>,
);
