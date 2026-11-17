import { useEffect, useState } from "react";
import type { RobotState } from "./generated/state";
import { connectStateStream, type Connection } from "./stateStream";
import { getAccessToken } from "./api";

export function useRobotState() {
  const [state, setState] = useState<RobotState | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [streamError, setStreamError] = useState("");
  useEffect(() => {
    const url = new URL("/api/v1/ws/state", window.location.href);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = getAccessToken();
    if (token) url.searchParams.set("access_token", token);
    return connectStateStream({
      url: url.toString(),
      onState: next => { setState(next); setStreamError(""); },
      onConnection: next => {
        setConnection(next);
        setStreamError(next === "disconnected" ? "Live state connection dropped; retrying." : "");
      },
    });
  }, []);
  return { state, connection, streamError };
}
