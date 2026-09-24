import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { FakeSocket } from "./test/FakeSocket";
import { initialState } from "./test/state";

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

function connect() {
  act(() => {
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].message(initialState);
  });
}

it("displays all three panels and disables run until telemetry arrives", () => {
  render(<App />);
  for (const name of ["Programming", "Digital Twin / Status", "Controls"]) {
    expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  }
  expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  connect();
  expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  expect(screen.getByTestId("pose-z")).toHaveTextContent("-200");
  expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
});

it("keeps labelled navigation and explicit simulator safety state available", () => {
  render(<App />);
  expect(
    screen.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeInTheDocument();
  expect(
    screen
      .getByRole("navigation", { name: "Primary navigation" })
      .querySelector("button.is-active"),
  ).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "LOCKED" })).toBeInTheDocument();
  expect(screen.getByText("Connecting")).toBeInTheDocument();
});

it("selects RoboDK through API and shows unavailable station error", async () => {
  const request = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: "RoboDK station file is missing" }), { status: 503 }),
  );
  vi.stubGlobal("fetch", request);
  render(<App />);
  connect();
  await userEvent.selectOptions(screen.getByLabelText("Robot connection"), "RoboDK Digital Twin");
  expect(request).toHaveBeenCalledWith(
    "/api/v1/mode",
    expect.objectContaining({ body: '{"mode":"robodk"}' }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("station file is missing");
});

it("exposes named navigation and profile disclosure state", async () => {
  render(<App />);
  const navigation = screen.getByRole("navigation", {
    name: "Primary navigation",
  });
  expect(
    within(navigation).getByRole("button", { name: "Code Editor" }),
  ).toHaveAttribute("aria-current", "page");
  const profile = screen.getByRole("button", { name: "Profile menu" });
  expect(profile).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(profile);
  expect(profile).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("dialog", { name: "Profile" })).toBeVisible();
});

it("shows jog failures on the Control route", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Jog failed")));
  render(<App />);
  connect();
  await userEvent.click(screen.getByRole("button", { name: "Control" }));
  await userEvent.click(screen.getByRole("button", { name: "X+" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Jog failed");
});

it("rejects malformed JSON locally without a network request", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  render(<App />);
  connect();
  fireEvent.change(screen.getByLabelText("RobotProgramV1 JSON"), {
    target: { value: "{bad" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Validate" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON");
  expect(request).not.toHaveBeenCalled();
});

it("sends the edited program, displays validation errors, and clears stale success on edit", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ valid: true, command_count: 9 })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: [{ loc: ["body", "version"], msg: "Input should be 1" }],
        }),
        { status: 422 },
      ),
    );
  vi.stubGlobal("fetch", request);
  render(<App />);
  connect();
  await userEvent.click(screen.getByRole("button", { name: "Validate" }));
  expect(
    await screen.findByText("Valid program · 9 commands"),
  ).toBeInTheDocument();
  const editor = screen.getByLabelText("RobotProgramV1 JSON");
  fireEvent.change(editor, { target: { value: '{"version":2}' } });
  expect(
    screen.queryByText("Valid program · 9 commands"),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "body.version: Input should be 1",
  );
  expect(request.mock.calls[1][0]).toBe("/api/v1/runs");
  expect(request.mock.calls[1][1].body).toBe('{"version":2}');
});

it("runs, consumes live command state, stops and resets the mock through the API", async () => {
  const request = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ run_id: "run-1" })),
    );
  vi.stubGlobal("fetch", request);
  render(<App />);
  connect();
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  act(() =>
    FakeSocket.instances[0].message({
      ...initialState,
      status: "running",
      run_id: "run-1",
      active_command_id: "c5",
      active_command_type: "wait",
      total_commands: 9,
      x_mm: 100,
    }),
  );
  expect(screen.getByTestId("active-command")).toHaveTextContent("c5 · wait");
  expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(request.mock.calls[1][0]).toBe("/api/v1/runs/run-1/stop");
  act(() =>
    FakeSocket.instances[0].message({
      ...initialState,
      status: "stopped",
      run_id: "run-1",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(request.mock.calls[2][0]).toBe("/api/v1/reset");
});

it("labels retained state as stale on disconnect and shows request failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  render(<App />);
  connect();
  await userEvent.click(screen.getByRole("button", { name: "Run" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
  act(() => FakeSocket.instances[0].close());
  expect(screen.getByText(/Disconnected.*retrying/)).toBeInTheDocument();
  expect(screen.getByText(/Last received state.*stale/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
});

it.each(["Stop", "Reset"] as const)(
  "allows %s while an accepted Run HTTP response is delayed",
  async (action) => {
    let resolveRun!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => {
      resolveRun = resolve;
    });
    const request = vi
      .fn()
      .mockImplementation((path: string) =>
        path === "/api/v1/runs"
          ? delayed
          : Promise.resolve(new Response(JSON.stringify(initialState))),
      );
    vi.stubGlobal("fetch", request);
    render(<App />);
    connect();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    act(() =>
      FakeSocket.instances[0].message({
        ...initialState,
        status: "running",
        run_id: "slow",
        active_command_id: "waiting",
        active_command_type: "wait",
      }),
    );
    expect(screen.getByRole("button", { name: action })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: action }));
    expect(request.mock.calls[1][0]).toBe(
      action === "Stop" ? "/api/v1/runs/slow/stop" : "/api/v1/reset",
    );
    const feedback =
      action === "Stop"
        ? "Stop request finished. See live run status."
        : "Mock reset. Your program is unchanged.";
    expect(await screen.findByText(feedback)).toBeInTheDocument();
    await act(async () =>
      resolveRun(new Response(JSON.stringify({ run_id: "slow" }))),
    );
    expect(screen.getByText(feedback)).toBeInTheDocument();
    expect(
      screen.queryByText("Run accepted. Follow live progress below."),
    ).not.toBeInTheDocument();
  },
);
