import { isOutlookGuid, type OutlookProbeInput, type OutlookProbeSnapshot } from '../../shared/outlook-probe.ts';
import { createScopedFetch } from './application-auth.ts';
import { getApplicationScope } from './application-scope.ts';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export class OutlookProbeRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

function snapshot(value: unknown, id: string): OutlookProbeSnapshot {
  if (!record(value) || value.id !== id || (value.mode !== 'read' && value.mode !== 'full') ||
    (value.phase !== 'preparing' && value.phase !== 'awaiting-sign-in' && value.phase !== 'running' && value.phase !== 'finished' && value.phase !== 'cancelled') ||
    !Array.isArray(value.checks) || value.checks.length > 4) throw new Error('The host returned an invalid Outlook test result.');
  const checks: OutlookProbeSnapshot['checks'] = value.checks.map((check: unknown) => {
    if (!record(check) || (check.stage !== 'sign-in' && check.stage !== 'mailbox-read' && check.stage !== 'token-refresh' && check.stage !== 'refreshed-mailbox-read') ||
      (check.status !== 'running' && check.status !== 'passed' && check.status !== 'failed') ||
      (check.code !== undefined && (typeof check.code !== 'string' || !/^[A-Z][A-Z0-9_]{1,80}$/.test(check.code))) ||
      (check.guidance !== undefined && (typeof check.guidance !== 'string' || check.guidance.length > 512))) throw new Error('The host returned invalid Outlook test checks.');
    return { stage: check.stage, status: check.status, ...(typeof check.code === 'string' ? { code: check.code } : {}), ...(typeof check.guidance === 'string' ? { guidance: check.guidance } : {}) };
  });
  if (new Set(checks.map(check => check.stage)).size !== checks.length) throw new Error('The host returned duplicate Outlook test checks.');
  // Project only the content-free UI contract; never pass arbitrary host response fields through.
  return { id, mode: value.mode, phase: value.phase, checks };
}

/** Capture the application identity once, including cancellation after a component unmount. */
export function createOutlookProbeClient(fetcher = createScopedFetch(getApplicationScope())) {
  async function call(id: string, signal: AbortSignal, method = 'GET', input?: OutlookProbeInput) {
    if (!isOutlookGuid(id)) throw new Error('Invalid Outlook test identity.');
    const response = await fetcher(`/host/outlook-probe${input ? '' : `/${id}`}`, {
      method, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), credentials: 'include', cache: 'no-store',
      ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json', 'X-Superlocal': '1' }, body: JSON.stringify(input ?? {}) }),
    });
    const value: unknown = await response.json();
    signal.throwIfAborted();
    if (!response.ok) {
      const message = record(value) && typeof value.error === 'string' && value.error.length <= 512 ? value.error : 'The Outlook test could not be reached. Retry the status check or cancel the test.';
      throw new OutlookProbeRequestError(message, response.status);
    }
    return snapshot(value, id);
  }
  return {
    start: (input: OutlookProbeInput, signal: AbortSignal) => call(input.id, signal, 'POST', input),
    status: (id: string, signal: AbortSignal) => call(id, signal),
    cancel: (id: string, signal: AbortSignal) => call(id, signal, 'DELETE'),
  };
}
