import { useState, type FormEvent } from "react";
import App from "../App";
import { useAuth } from "./AuthProvider";

export function AuthGate() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  if (auth.status === "loading")
    return (
      <main className="auth-page">
        <p>Loading secure workspace…</p>
      </main>
    );
  if (auth.status === "authenticated") return <App />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    try {
      if (mode === "login") await auth.signInWithPassword(email, password);
      else if (mode === "register") {
        await auth.signUp(email, password);
        setNotice("Check your email to verify this account.");
      } else {
        await auth.resetPassword(email);
        setNotice("Password reset email sent.");
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span>Δ</span>
          <strong>DeltaX</strong>
        </div>
        <h1>
          {mode === "login"
            ? "Sign in"
            : mode === "register"
              ? "Create account"
              : "Reset password"}
        </h1>
        <p>Simulation-first robotics workspace.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <div className="password-field">
                <input
                  required
                  minLength={8}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          )}
          <button className="auth-primary" disabled={pending}>
            {pending
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Register"
                  : "Send reset link"}
          </button>
        </form>
        {mode !== "reset" && (
          <button
            className="oauth-button"
            disabled={pending}
            onClick={() => void auth.signInWithGoogle()}
          >
            Continue with Google
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
        {auth.error && <p role="alert">{auth.error}</p>}
        <nav className="auth-links">
          {mode !== "login" && (
            <button onClick={() => setMode("login")}>Sign in</button>
          )}
          {mode !== "register" && (
            <button onClick={() => setMode("register")}>Create account</button>
          )}
          {mode !== "reset" && (
            <button onClick={() => setMode("reset")}>Forgot password?</button>
          )}
        </nav>
      </section>
    </main>
  );
}
