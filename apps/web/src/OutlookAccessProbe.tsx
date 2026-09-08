import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { isOutlookGuid, outlookGuidPattern, type OutlookPermissionMode, type OutlookProbeSnapshot } from '../../shared/outlook-probe';
import { createOutlookProbeClient, OutlookProbeRequestError } from './outlook-probe-client';

const stages = [
  { id: 'sign-in', label: 'Microsoft sign-in and consent' },
  { id: 'mailbox-read', label: 'Read mailbox' },
  { id: 'token-refresh', label: 'Refresh access token' },
  { id: 'refreshed-mailbox-read', label: 'Read with refreshed token' },
];
const active = (result: OutlookProbeSnapshot | null) => result !== null && result.phase !== 'finished' && result.phase !== 'cancelled';

export default function OutlookAccessProbe({ redirectUri, onBusyChange }: { redirectUri: string; onBusyChange: (busy: boolean) => void }) {
  const [client] = useState(() => createOutlookProbeClient());
  const [mode, setMode] = useState<OutlookPermissionMode>('read');
  const [result, setResult] = useState<OutlookProbeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [opened, setOpened] = useState(false);
  const [clientId, setClientId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const attemptId = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const busy = pending || active(result) && error === null;
  const showingResult = result !== null;

  useLayoutEffect(() => {
    root.current?.closest('section')?.scrollIntoView({ block: 'start' });
  }, [showingResult]);

  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    root.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
      operation.current?.abort();
      if (attemptId.current) void client.cancel(attemptId.current, AbortSignal.timeout(5_000)).catch(() => {});
    };
  }, [client]);

  const id = result?.id;
  const running = active(result);
  useEffect(() => {
    if (!id || !running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await client.status(id, controller.signal);
        if (controller.signal.aborted || attemptId.current !== id) return;
        setResult(next);
        setError(null);
        if (active(next)) timer = setTimeout(() => void poll(), 1_000);
        else attemptId.current = null;
      } catch (cause) {
        if (!controller.signal.aborted && attemptId.current === id) {
          if (cause instanceof OutlookProbeRequestError && cause.status === 404) { attemptId.current = null; setResult(null); }
          setError(cause instanceof Error ? cause.message : 'The status check failed. Try again.');
        }
      }
    };
    timer = setTimeout(() => void poll(), 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, running, pollVersion, client]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation.current || busy) return;
    if (!isOutlookGuid(clientId.trim()) || !isOutlookGuid(tenantId.trim())) { setError('Enter valid application and directory IDs.'); return; }
    const controller = new AbortController();
    operation.current = controller;
    const id = crypto.randomUUID();
    attemptId.current = id;
    setPending(true); setError(null); setOpened(false);
    try {
      const next = await client.start({ id, clientId: clientId.trim(), tenantId: tenantId.trim(), mode }, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setResult(next);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      // A lost POST response may have started the attempt; recover via its original ID.
      if (cause instanceof OutlookProbeRequestError && cause.status >= 400 && cause.status < 500) attemptId.current = null;
      else setResult({ id, mode, phase: 'preparing', checks: [] });
      setError(cause instanceof Error ? cause.message : 'Starting the Outlook test failed.');
    } finally { if (operation.current === controller) operation.current = null; if (mounted.current) setPending(false); }
  }

  async function cancel() {
    const id = attemptId.current;
    if (!id || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setPending(true);
    try {
      try { await client.cancel(id, controller.signal); }
      catch (cause) { if (!(cause instanceof OutlookProbeRequestError && cause.status === 404)) throw cause; }
      if (!mounted.current) return;
      attemptId.current = null;
      setResult(current => current ? { ...current, phase: 'cancelled' } : null); setError(null);
    } catch {
      if (mounted.current) setError('Cancellation could not be confirmed. Retry; the host expires unfinished tests after ten minutes.');
    } finally { if (operation.current === controller) operation.current = null; if (mounted.current) setPending(false); }
  }

  const passed = result?.phase === 'finished' && result.checks.length === 4 && result.checks.every(check => check.status === 'passed');
  return <div className="provider-flow outlook-probe" ref={root} tabIndex={-1}>
    <p className="settings-note">Test access for your Microsoft work account. This checks your organization’s consent rules for this app and device. It does not add a connected mailbox.</p>
    {!result && <form className="provider-connect" onSubmit={event => void start(event)}>
      <details className="provider-advanced">
        <summary>Microsoft app setup</summary>
        <p className="settings-note">Use an app registered in your organization’s Microsoft Entra tenant. Add a Mobile and desktop applications redirect URI with this exact address:</p>
        <code className="outlook-redirect">{redirectUri}</code>
        <p className="settings-note">Use delegated Microsoft Graph Mail.Read for the read test; Mail.ReadWrite and Mail.Send for the full-client consent test. No client secret is needed. If app registration or consent is blocked, ask IT to approve the app. <a href="https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration" target="_blank" rel="noopener noreferrer">Microsoft setup guide</a></p>
      </details>
      <label className="settings-field"><span>Application (client) ID</span><input value={clientId} onChange={event => setClientId(event.target.value)} pattern={outlookGuidPattern} maxLength={36} required disabled={pending} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
      <label className="settings-field"><span>Directory (tenant) ID</span><input value={tenantId} onChange={event => setTenantId(event.target.value)} pattern={outlookGuidPattern} maxLength={36} required disabled={pending} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
      <label className="settings-field"><span>Permissions to test</span><select value={mode} disabled={pending} onChange={event => setMode(event.target.value === 'full' ? 'full' : 'read')}><option value="read">Read-only (Mail.Read)</option><option value="full">Full-client consent (Mail.ReadWrite + Mail.Send)</option></select></label>
      <p className="settings-note">{mode === 'full' ? 'Requests read, write and send permission, but does not send or change any mail.' : 'Reads at most one message ID. No subjects, bodies or attachments are retrieved.'} Tokens stay in host memory and are discarded when the test ends. Microsoft consent remains until revoked.</p>
      <button type="submit" className="settings-button" disabled={pending}>{pending ? 'Preparing sign-in…' : 'Start Outlook test'}</button>
    </form>}
    {result && <>
      <div role="status" aria-live="polite">
        <p className="provider-result">{result.phase === 'cancelled' ? 'Test cancelled.' : passed ? 'Access test passed. No mailbox was added.' : result.phase === 'finished' ? 'Access test did not pass.' : result.phase === 'awaiting-sign-in' ? 'Sign in with your work account in the Microsoft tab, then return here.' : result.phase === 'preparing' ? 'Preparing Microsoft sign-in…' : 'Checking mailbox access…'}</p>
        <ol className="provider-phases">{stages.map(stage => {
          const check = result.checks.find(check => check.stage === stage.id);
          const label = check?.status === 'passed' ? 'Passed' : check?.status === 'failed' ? 'Failed' : result.phase === 'cancelled' ? 'Stopped' : check?.status === 'running' ? 'In progress' : 'Not tested';
          return <li key={stage.id} data-state={check?.status === 'passed' ? 'done' : check?.status === 'failed' ? 'failed' : 'pending'}><span>{stage.label}</span><small>{label}</small></li>;
        })}</ol>
      </div>
      {result.phase === 'awaiting-sign-in' && <a className="settings-button outlook-sign-in" href={`/host/outlook-probe/authorize/${result.id}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>{opened ? 'Open Microsoft again ↗' : 'Continue to Microsoft ↗'}</a>}
      {result.checks.filter(check => check.status === 'failed').map(check => <p className="provider-connection-error" role="alert" key={check.stage}>{check.guidance} {check.code && <code>{check.code}</code>}</p>)}
      {result.phase === 'finished' && <p className="settings-note">This result applies to this app, account, device and time. Sending, editing and long-term background access are untested.{result.mode === 'read' && ' Read-only success does not establish full-client consent.'}</p>}
    </>}
    {error && <p className="provider-connection-error" role="alert">{error}</p>}
    {error && active(result) && <p className="settings-note">You can retry or go back. Leaving this page tries to cancel the test; unfinished tests expire after ten minutes.</p>}
    {result && <div className="mailbox-bulk-actions">
      {active(result) && <button type="button" className="settings-text-button" disabled={pending} onClick={() => void cancel()}>{pending ? 'Cancelling…' : 'Cancel test'}</button>}
      {active(result) && error && <button type="button" className="settings-text-button" disabled={pending} onClick={() => { setError(null); setPollVersion(value => value + 1); }}>Retry status check</button>}
      {!active(result) && <button type="button" className="settings-button" onClick={() => { setResult(null); setError(null); setOpened(false); root.current?.focus({ preventScroll: true }); }}>Test again</button>}
    </div>}
  </div>;
}
