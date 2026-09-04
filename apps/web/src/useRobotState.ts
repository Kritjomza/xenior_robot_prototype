import { useEffect, useState } from 'react'
import type { RobotState } from './generated/state'
import { connectStateStream, type Connection } from './stateStream'

export function useRobotState() {
  const [state, setState] = useState<RobotState | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  useEffect(() => {
    const url = new URL('/api/v1/ws/state', window.location.href)
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return connectStateStream({ url: url.toString(), onState: setState, onConnection: setConnection })
  }, [])
  return { state, connection }
}
