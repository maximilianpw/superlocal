import { createHash, randomBytes } from 'node:crypto'
import { InboxError } from 'inbox-sdk'
import { isOutlookGuid, type OutlookProbeInput, type OutlookProbeSnapshot } from '../../shared/outlook-probe'
import { createMicrosoftAuthentication } from './outlook-probe-microsoft'
import { ProbeFailure, readMailbox, runProbe } from './outlook-probe-checks'

export const outlookProbePath = '/host/outlook-probe'
export const outlookProbeCallback = `${outlookProbePath}/callback`
export const outlookProbeNavigation = (path: string) => path === outlookProbeCallback || /^\/host\/outlook-probe\/authorize\/[0-9a-f-]{36}$/.test(path)

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" }
const bad = (code: string, message: string, status = 400) => new InboxError(`HOST_OUTLOOK_${code}`, message, status)
type Attempt = {
  input: OutlookProbeInput; snapshot: OutlookProbeSnapshot; expires: number;
  controller: AbortController; state: string; authorizeUrl?: string;
  accept?: (code: string) => void; reject?: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>; task?: Promise<void>;
}

/** One bounded, memory-only attempt per application owner/session. Never creates SDK mailboxes. */
export function createOutlookProbe(origin: string, dependencies: {
  createAuthentication?: typeof createMicrosoftAuthentication;
  read?: typeof readMailbox;
  timeoutMs?: number;
} = {}) {
  const attempts = new Map<string, Attempt>()
  const redirectUri = new URL(outlookProbeCallback, origin).href
  const enabled = new URL(origin).hostname === 'localhost' && new URL(origin).protocol === 'http:'
  let closed = false
  const active = (attempt: Attempt) => !['finished', 'cancelled'].includes(attempt.snapshot.phase)
  const copy = (attempt: Attempt) => structuredClone(attempt.snapshot)
  function cancel(attempt: Attempt) {
    if (!active(attempt)) return
    attempt.snapshot.phase = 'cancelled'
    attempt.authorizeUrl = undefined
    clearTimeout(attempt.timer)
    attempt.controller.abort(new ProbeFailure('CANCELLED', 'The Outlook test was cancelled.'))
  }
  function find(owner: string, id: string): Attempt {
    const attempt = attempts.get(owner)
    if (!attempt || attempt.input.id !== id || attempt.expires <= Date.now()) throw bad('NOT_FOUND', 'This Outlook test expired or belongs to another session. Start a new test.', 404)
    return attempt
  }
  return {
    configuration: { enabled, redirectUri: enabled ? redirectUri : undefined },
    start(owner: string, input: Record<string, unknown>): OutlookProbeSnapshot {
      if (!enabled || closed) throw bad('UNAVAILABLE', 'Open this installation at its configured http://localhost address to test Outlook.', 409)
      if (Object.keys(input).length !== 4 || !isOutlookGuid(input.id) || !isOutlookGuid(input.clientId) || !isOutlookGuid(input.tenantId) || (input.mode !== 'read' && input.mode !== 'full')) {
        throw bad('INVALID_INPUT', 'Enter valid application and directory IDs, and choose a permission test.')
      }
      for (const [key, attempt] of attempts) if (attempt.expires <= Date.now()) { cancel(attempt); attempts.delete(key) }
      const current = attempts.get(owner)
      if (current?.input.id === input.id) {
        if (current.input.clientId !== input.clientId || current.input.tenantId !== input.tenantId || current.input.mode !== input.mode) throw bad('CONFLICT', 'Start a new test after changing its configuration.', 409)
        return copy(current)
      }
      if (current && active(current)) throw bad('BUSY', 'An Outlook test is already running in this session. Finish it or wait ten minutes before starting another.', 409)
      if (!current && attempts.size >= 256) throw bad('CAPACITY', 'The Outlook test is at capacity. Try again later.', 429)
      const value: OutlookProbeInput = { id: input.id, clientId: input.clientId, tenantId: input.tenantId, mode: input.mode }
      const attempt: Attempt = {
        input: value, snapshot: { id: value.id, mode: value.mode, phase: 'preparing', checks: [] },
        expires: Date.now() + 30 * 60_000, controller: new AbortController(), state: randomBytes(32).toString('base64url'),
      }
      attempts.set(owner, attempt)
      const signal = attempt.controller.signal
      attempt.timer = setTimeout(() => attempt.controller.abort(new ProbeFailure('SIGN_IN_TIMEOUT', 'The test did not finish within ten minutes. Try again.')), dependencies.timeoutMs ?? 600_000)
      attempt.timer.unref()
      attempt.task = (async () => {
        const auth = (dependencies.createAuthentication ?? createMicrosoftAuthentication)({ ...value, signal,
          async authorize(makeUrl) {
            const verifier = randomBytes(32).toString('base64url')
            const challenge = createHash('sha256').update(verifier).digest('base64url')
            const authorization = await makeUrl({ redirectUri, state: attempt.state, challenge })
            signal.throwIfAborted()
            const url = new URL(authorization)
            if (url.origin !== 'https://login.microsoftonline.com' || url.username || url.password) throw new ProbeFailure('INVALID_AUTHORITY', 'Microsoft returned an unexpected sign-in address.')
            attempt.authorizeUrl = url.href
            const code = await new Promise<string>((resolve, reject) => {
              const aborted = () => { cleanup(); reject(signal.reason) }
              const cleanup = () => { signal.removeEventListener('abort', aborted); attempt.accept = undefined; attempt.reject = undefined }
              attempt.accept = code => { cleanup(); resolve(code) }
              attempt.reject = error => { cleanup(); reject(error) }
              signal.addEventListener('abort', aborted, { once: true })
              attempt.snapshot.phase = 'awaiting-sign-in'
            })
            signal.throwIfAborted()
            attempt.snapshot.phase = 'running'
            return { code, verifier, redirectUri }
          },
        })
        const report = await runProbe({ mode: value.mode, auth, signal,
          read: token => (dependencies.read ?? readMailbox)(token, fetch, signal),
          progress(stage, status) {
            if (signal.aborted) return
            const previous = attempt.snapshot.checks.filter(check => check.stage !== stage)
            attempt.snapshot.checks = [...previous, { stage, status }]
          },
        })
        if (attempt.snapshot.phase !== 'cancelled') attempt.snapshot = { ...attempt.snapshot, phase: 'finished', checks: report.checks, report }
      })().catch(() => {
        if (attempt.snapshot.phase !== 'cancelled') attempt.snapshot = { ...attempt.snapshot, phase: 'finished', checks: [...attempt.snapshot.checks.filter(check => check.status === 'passed'), { stage: attempt.snapshot.checks.find(check => check.status === 'running')?.stage ?? 'sign-in', status: 'failed', code: 'PROBE_FAILED', guidance: 'The Outlook test could not finish. Try again.' }] }
      }).finally(() => { clearTimeout(attempt.timer); attempt.authorizeUrl = undefined; attempt.accept = undefined; attempt.reject = undefined })
      return copy(attempt)
    },
    status(owner: string, id: string) { return copy(find(owner, id)) },
    cancel(owner: string, id: string) { const attempt = find(owner, id); cancel(attempt); return copy(attempt) },
    authorize(owner: string, id: string) {
      const attempt = find(owner, id)
      if (!attempt.authorizeUrl || attempt.snapshot.phase !== 'awaiting-sign-in') throw bad('EXPIRED', 'This Microsoft sign-in link is no longer active. Return to Superlocal.', 409)
      const location = attempt.authorizeUrl
      return new Response(null, { status: 303, headers: { ...headers, Location: location } })
    },
    callback(owner: string, url: URL) {
      const attempt = attempts.get(owner)
      const state = url.searchParams.get('state')
      if (!attempt || !active(attempt) || attempt.expires <= Date.now() || !attempt.accept || !state || url.searchParams.getAll('state').length !== 1 || state !== attempt.state) {
        return new Response('Invalid or expired Microsoft response. Return to Superlocal to start a new test.', { status: 400, headers })
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (error) {
        const aad = url.searchParams.get('error_description')?.match(/AADSTS\d{5,}/)?.[0]
        attempt.reject?.(aad ? new Error(aad) : new ProbeFailure('CONSENT_NOT_COMPLETED', 'Microsoft sign-in was cancelled or consent was not completed. This alone does not establish an organization policy block.'))
      } else if (!code || code.length > 16_384 || url.searchParams.getAll('code').length !== 1) {
        attempt.reject?.(new ProbeFailure('INVALID_CALLBACK', 'Microsoft returned no valid authorization code. Try again.'))
      } else attempt.accept(code)
      attempt.authorizeUrl = undefined
      return new Response('Microsoft response received. Return to the Superlocal tab for your Outlook test results. You can close this tab.', { headers })
    },
    async close() { closed = true; for (const attempt of attempts.values()) cancel(attempt); await Promise.allSettled([...attempts.values()].flatMap(attempt => attempt.task ? [attempt.task] : [])); attempts.clear() },
  }
}
