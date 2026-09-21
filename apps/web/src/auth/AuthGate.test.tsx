import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";

const auth = vi.hoisted(() => ({
  status: "unauthenticated" as const,
  user: null,
  error: null,
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("./AuthProvider", () => ({ useAuth: () => auth }));

beforeEach(() => vi.clearAllMocks());

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
