export class FakeSocket {
  static instances: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(public url: string) { FakeSocket.instances.push(this) }
  open() { this.onopen?.() }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  close() { this.closed = true; this.onclose?.() }
}
