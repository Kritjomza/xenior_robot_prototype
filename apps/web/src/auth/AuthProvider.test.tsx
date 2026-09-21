import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { AuthProvider, type AuthClient, useAuth } from "./AuthProvider";
import { createBrowserSupabaseClient } from "./supabase";

const session = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user-1", email: "operator@example.com" },
} as Session;

function fakeClient(initialSession: Session | null) {
  let listener: ((event: string, next: Session | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: initialSession }, error: null }),
      onAuthStateChange: vi.fn((callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut,
    },
  } as unknown as AuthClient;
  return {
    client,
    emit: (event: string, next: Session | null) => listener?.(event, next),
    unsubscribe,
    signOut,
  };
}

function Consumer() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.status}</span>
      <span>{auth.user?.email ?? "no user"}</span>
      <span>{auth.getAccessToken() ?? "no token"}</span>
      <button onClick={() => void auth.signOut()}>Log out</button>
    </div>
  );
}

it("fails closed with setup guidance when Supabase browser configuration is missing", () => {
  expect(
    createBrowserSupabaseClient({
      VITE_SUPABASE_URL: "https://project.supabase.co",
    }),
  ).toBeNull();
  expect(
    createBrowserSupabaseClient({
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_only",
    }),
  ).toBeNull();
  render(
    <AuthProvider client={null}>
      <Consumer />
    </AuthProvider>,
  );
  expect(
    screen.getByRole("heading", { name: "Supabase setup required" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("no user")).not.toBeInTheDocument();
});

it("loads the persistent session and follows subsequent auth state changes", async () => {
  const auth = fakeClient(session);
  const view = render(
    <AuthProvider client={auth.client}>
      <Consumer />
    </AuthProvider>,
  );
  expect(screen.getByText("loading")).toBeInTheDocument();
  expect(await screen.findByText("operator@example.com")).toBeInTheDocument();
  expect(screen.getByText("access-token")).toBeInTheDocument();

  auth.emit("SIGNED_OUT", null);
  expect(await screen.findByText("anonymous")).toBeInTheDocument();
  expect(screen.getByText("no token")).toBeInTheDocument();
  view.unmount();
  expect(auth.unsubscribe).toHaveBeenCalledOnce();
});

it("logs out through Supabase and clears the local authenticated state", async () => {
  const auth = fakeClient(session);
  render(
    <AuthProvider client={auth.client}>
      <Consumer />
    </AuthProvider>,
  );
  expect(await screen.findByText("authenticated")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
  expect(screen.getByText("anonymous")).toBeInTheDocument();
});
