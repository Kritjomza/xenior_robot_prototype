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
  if (auth.status === "authenticated")
    return (
      <App
        userId={auth.user?.id}
        email={auth.user?.email}
        onLogout={() => void auth.signOut()}
      />
    );
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
      <section className="auth-context" aria-label="DeltaX workflow">
        <div className="auth-context__brand">
          <span>Δ</span>
          <strong>DeltaX</strong>
          <small>MISSION CONTROL</small>
        </div>
        <div className="auth-context__copy">
          <h2>Program with confidence. Simulate with control.</h2>
          <p>
            A focused workspace for building safe, ordered command sequences for
            a Delta robot digital twin.
          </p>
        </div>
        <ol className="auth-steps">
          <li>
            <strong>Program</strong>
            <span>Build an ordered command sequence.</span>
          </li>
          <li>
            <strong>Validate</strong>
            <span>Check every command before execution.</span>
          </li>
          <li>
            <strong>Simulate</strong>
            <span>Run only after deliberate safety unlock.</span>
          </li>
          <li>
            <strong>Observe</strong>
            <span>Follow pose, progress, and robot state.</span>
          </li>
        </ol>
        <p className="auth-context__note">
          Simulation workspace · No physical hardware path
        </p>
      </section>
      <section className="auth-panel">
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
          <nav className="auth-links" aria-label="Authentication options">
            {mode !== "login" && (
              <button onClick={() => setMode("login")}>Sign in</button>
            )}
            {mode !== "register" && (
              <button onClick={() => setMode("register")}>
                Create account
              </button>
            )}
            {mode !== "reset" && (
              <button onClick={() => setMode("reset")}>Forgot password?</button>
            )}
          </nav>
        </section>
      </section>
    </main>
  );
}
