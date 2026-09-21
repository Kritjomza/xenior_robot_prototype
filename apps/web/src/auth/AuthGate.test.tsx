import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";

const auth = vi.hoisted(() => ({
  status: "unauthenticated" as "unauthenticated" | "loading" | "anonymous" | "authenticated",
  user: null,
  error: null,
  isPasswordRecovery: false,
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  clearError: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("./AuthProvider", () => ({ useAuth: () => auth }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.status = "unauthenticated";
  auth.isPasswordRecovery = false;
});

it("presents the command workflow beside sign in", () => {
  render(<AuthGate />);
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
  for (const step of ["Program", "Validate", "Simulate", "Observe"])
    expect(screen.getByText(step)).toBeVisible();
  expect(
    screen.getByRole("navigation", { name: "Authentication options" }),
  ).toBeVisible();
});

it("keeps email context while switching to account creation", async () => {
  render(<AuthGate />);
  const email = screen.getByLabelText("Email");
  fireEvent.change(email, { target: { value: "operator@example.com" } });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByRole("heading", { name: "Create account" })).toBeVisible();
  expect(email).toHaveValue("operator@example.com");
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
});

it("renders the password update view when in password recovery mode", async () => {
  auth.status = "authenticated";
  auth.isPasswordRecovery = true;
  render(<AuthGate />);
  expect(screen.getByRole("heading", { name: "Set new password" })).toBeVisible();
  const passwordInput = screen.getByLabelText("New Password");
  fireEvent.change(passwordInput, { target: { value: "newSecretPassword123" } });
  await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
  expect(auth.updatePassword).toHaveBeenCalledWith("newSecretPassword123");
});
