import { useRef, useState } from 'react'
import sample from '../../../protocol/examples/pick-and-place.json'
import { parseProgram, post } from './api'
import { useRobotState } from './useRobotState'

type Action = 'Validate' | 'Run' | 'Stop' | 'Reset'
const format = (value: number | undefined) => value === undefined ? '—' :
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)

export default function App() {
  const [source, setSource] = useState(JSON.stringify(sample, null, 2))
  const [pending, setPending] = useState<Action | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const latestRequest = useRef(0)
  const { state, connection } = useRobotState()
  const live = connection === 'connected'
  const running = state?.status === 'running' || state?.status === 'stopping'

  async function perform(action: Action) {
    const request = ++latestRequest.current
    const report = (message: string) => {
      if (request === latestRequest.current) setNotice(message)
    }
    setError('')
    setNotice('')
    setPending(action)
    try {
      if (action === 'Validate') {
        const result = await post<{ valid: boolean; command_count: number }>(
          'programs/validate', parseProgram(source))
        report(`Valid program · ${result.command_count} commands`)
      } else if (action === 'Run') {
        await post('runs', parseProgram(source))
        report('Run accepted. Follow live progress below.')
      } else if (action === 'Stop' && state?.run_id) {
        await post(`runs/${encodeURIComponent(state.run_id)}/stop`)
        report('Stop request finished. See live run status.')
      } else if (action === 'Reset') {
        await post('reset')
        report('Mock reset. Your program is unchanged.')
      }
    } catch (failure) {
      if (request === latestRequest.current) {
        setError(failure instanceof Error ? failure.message : 'Request failed')
      }
    } finally {
      if (request === latestRequest.current) setPending(null)
    }
  }

  return <div className="workspace">
    <header className="masthead">
      <div className="brand"><span className="brand-mark" aria-hidden="true">Δ</span>
        <div><span className="eyebrow">ROBOTICS WORKSPACE</span><h1>Delta Lab</h1></div></div>
      <div className="header-status"><span className="mode-pill" data-testid="mode">Mock mode</span>
        <span className={`connection ${live ? 'live' : ''}`} role="status">
          <i aria-hidden="true" />{live ? 'Live connection' : connection === 'connecting'
            ? 'Connecting…' : 'Disconnected · retrying…'}</span></div>
    </header>

    <div className="intro"><div><span className="eyebrow">PHASE 01 / EXECUTABLE FOUNDATION</span>
      <h2>Program. Run. Observe.</h2><p>A mock robot workspace with live telemetry.</p></div>
      <span className="units">mm <b>/</b> mm/s <b>/</b> degrees <b>/</b> seconds</span></div>

    <main className="panels">
      <section className="panel programming" aria-labelledby="programming-title">
        <div className="panel-heading"><span className="panel-number">01</span>
          <h2 id="programming-title">Programming</h2><span className="tag">JSON · v1</span></div>
        <p className="panel-description">Edit the pick-and-place program, then validate or run.</p>
        <label htmlFor="program">RobotProgramV1 JSON</label>
        <textarea id="program" spellCheck={false} value={source} disabled={!!pending || running}
          onChange={event => { setSource(event.target.value); setNotice(''); setError('') }} />
        <div className="editor-footer"><span>7 allowlisted commands</span><span>Server validated</span></div>
      </section>

      <section className="panel twin" aria-labelledby="twin-title">
        <div className="panel-heading"><span className="panel-number">02</span>
          <h2 id="twin-title">Digital Twin / Status</h2></div>
        <p className="panel-description">Mock coordinates · no kinematics or physical motion.</p>
        {!live && <p className="stale" role="status">{state ? 'Last received state · stale' : 'Waiting for robot state'}</p>}
        <div className="pose-view" aria-label="Mock Cartesian position">
          <div className="pose-caption">TOOL CENTRE POINT <span>XYZ / mm</span></div>
          <div className="pose-values">{(['x', 'y', 'z'] as const).map(axis =>
            <div key={axis}><span>{axis.toUpperCase()}</span>
              <strong data-testid={`pose-${axis}`}>{format(state?.[`${axis}_mm`])}</strong></div>)}</div>
          <div className="coordinate-note">Base-centred frame · +Z upward</div>
        </div>
        <div className="telemetry-grid">
          <div><span>Speed</span><strong data-testid="speed">{format(state?.speed_mm_s)} <small>mm/s</small></strong></div>
          <div><span>Gripper</span><strong data-testid="gripper">{state?.gripper ?? '—'}</strong></div>
          <div><span>Adapter</span><strong>{state ? state.connected ? 'Connected' : 'Disconnected' : '—'}</strong></div>
          <div><span>Run status</span><strong data-testid="run-status">{state?.status ?? '—'}</strong></div>
        </div>
        <div className="joints"><span>Mock joints <small>(fixed, degrees)</small></span>
          <div>{[0, 1, 2].map(index => <span key={index}>J{index + 1}<b>{format(state?.joints_deg[index])}°</b></span>)}</div></div>
        <div className="active"><span>ACTIVE COMMAND</span>
          <strong data-testid="active-command">{state?.active_command_id
            ? `${state.active_command_id} · ${state.active_command_type}` : '—'}</strong>
          <progress value={state?.completed_commands ?? 0} max={state?.total_commands || 1} aria-label="Program progress" />
          <span data-testid="progress-count">{state?.completed_commands ?? 0} / {state?.total_commands ?? 0} commands complete</span></div>
        <div className="run-meta">Program <code>{state?.program_name ?? 'No program running'}</code></div>
        <div className="run-meta">Run ID <code>{state?.run_id ?? 'No run yet'}</code></div>
        <div className={`fault ${state?.error ? 'has-error' : ''}`} role={state?.error ? 'alert' : undefined}>
          {state?.error ? `Robot error: ${state.error}` : 'No robot errors'}</div>
      </section>

      <section className="panel controls" aria-labelledby="controls-title">
        <div className="panel-heading"><span className="panel-number">03</span><h2 id="controls-title">Controls</h2></div>
        <p className="panel-description">One program at a time.</p>
        <div className="actions">
          <button disabled={!!pending || running} onClick={() => void perform('Validate')}>Validate</button>
          <button className="primary" disabled={!!pending || running || !live || !state?.connected || state.status === 'faulted'}
            onClick={() => void perform('Run')}>Run</button>
          <button className="stop" disabled={pending === 'Stop' || pending === 'Reset' || !running || !state?.run_id}
            onClick={() => void perform('Stop')}>Stop</button>
          <button disabled={pending === 'Stop' || pending === 'Reset' || (pending === 'Run' && !running)}
            onClick={() => void perform('Reset')}>Reset</button>
        </div>
        {pending && <p role="status">{pending} request…</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="request-error" role="alert">{error}</p>}
        <div className="control-help"><h3>Try the demo</h3><p>Home → pick → transfer → release → home.</p>
          <p>Stop cancels the run and keeps the current pose and grip. Reset cancels the run and restores the mock defaults.</p></div>
        <div className="mock-note"><span aria-hidden="true">◇</span><p>Mock only.<br />No hardware connected.</p></div>
      </section>
    </main>
    <footer><span>DELTA LAB / FOUNDATION v1</span><span>Software Stop · not a hardware emergency stop</span></footer>
  </div>
}
