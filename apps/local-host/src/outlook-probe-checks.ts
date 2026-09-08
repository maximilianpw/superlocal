import type { OutlookPermissionMode as PermissionMode, OutlookProbeStage as Stage, OutlookProbeReport as Report } from '../../shared/outlook-probe';
export const mailScopes = (mode: PermissionMode): string[] => mode === 'full'
  ? ['https://graph.microsoft.com/Mail.ReadWrite', 'https://graph.microsoft.com/Mail.Send']
  : ['https://graph.microsoft.com/Mail.Read'];

export interface Session {
  accessToken: string;
  grantedScopes: string[];
  fromCache: boolean;
}

export interface Authentication {
  signIn(): Promise<Session>;
  refresh(): Promise<Session>;
  clear(): Promise<void>;
}

export class ProbeFailure extends Error {
  constructor(readonly code: string, readonly guidance: string) {
    super(guidance);
  }
}

export function diagnose(error: unknown): { code: string; guidance: string } {
  if (error instanceof ProbeFailure) return { code: error.code, guidance: error.guidance };
  // Only emit recognized provider codes, never raw messages, tokens or response bodies.
  const text = error instanceof Error ? error.message : '';
  const aad = text.match(/AADSTS\d{5,}/)?.[0];
  const hints: Record<string, string> = {
    AADSTS65001: 'Consent is missing. Review the Microsoft consent screen or ask IT to approve this app.',
    AADSTS90094: 'Microsoft requires administrator consent. Ask IT to review this app and its delegated permissions.',
    AADSTS65004: 'Consent was declined. No mailbox access was established.',
    AADSTS53003: 'Conditional Access blocked this attempt. IT must review the sign-in policy and logs.',
    AADSTS53000: 'The device did not meet the organization’s compliance requirement. Ask IT about supported devices.',
    AADSTS50011: 'The redirect URI does not match. Register the redirect address shown in Superlocal as Mobile and desktop applications.',
    AADSTS700016: 'The client ID is not available in this tenant. Check the app registration and tenant ID.',
    AADSTS7000218: 'The registration expects a client secret. Configure a public desktop client; do not add a secret to this probe.',
    AADSTS50105: 'Your account is not assigned to this app. Ask IT to review its assignment requirements.',
    AADSTS700082: 'The refresh token expired. Sign in again; this does not establish a permanent organization restriction.',
  };
  if (aad) return { code: aad, guidance: hints[aad] ?? 'Microsoft rejected this step. Give IT this code and the time of the attempt.' };
  return { code: 'UNCLASSIFIED_FAILURE', guidance: 'The step failed without a recognized diagnostic code. Check connectivity and the Microsoft sign-in screen; no organization-policy conclusion can be drawn.' };
}


function verifyScopes(session: Session, mode: PermissionMode): void {
  const granted = new Set(session.grantedScopes.map(scope => scope.toLowerCase().replace('https://graph.microsoft.com/', '')));
  for (const scope of mailScopes(mode)) {
    if (!granted.has(scope.toLowerCase().replace('https://graph.microsoft.com/', ''))) {
      throw new ProbeFailure('MISSING_MAIL_SCOPE', 'The token response did not grant every requested mail permission. Review the consent configuration.');
    }
  }
  if (!session.accessToken) throw new ProbeFailure('MISSING_ACCESS_TOKEN', 'Microsoft did not return a usable access token.');
}

/** Reads one message ID only. Never follows pagination or fetches message text. Empty mailboxes pass. */
export async function readMailbox(accessToken: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetcher('https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=id', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
  } catch {
    signal?.throwIfAborted();
    throw new ProbeFailure('GRAPH_NETWORK_ERROR', 'Microsoft Graph could not be reached within 15 seconds. Check connectivity and retry.');
  }
  if (!response.ok) {
    const code = `GRAPH_HTTP_${response.status}`;
    const guidance = response.status === 403
      ? 'Graph denied mailbox access. This can reflect permissions or organization policy; IT can investigate the sign-in logs.'
      : response.status === 401
        ? 'Graph rejected the access token. Check the token audience and authentication configuration.'
        : response.status === 429
          ? 'Graph throttled the request. Wait before retrying; this is not proof that the organization blocks the app.'
          : 'Graph did not return a mailbox result. Check mailbox provisioning, licensing, and service availability.';
    await response.body?.cancel();
    throw new ProbeFailure(code, guidance);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('value' in payload) || !Array.isArray(payload.value)
    || payload.value.length > 1 || payload.value.some(item => !item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string')) {
    throw new ProbeFailure('INVALID_GRAPH_RESPONSE', 'Graph returned an unexpected response; mailbox access was not verified.');
  }
}

export async function runProbe(options: {
  mode: PermissionMode;
  auth: Authentication;
  read: (accessToken: string) => Promise<void>;
  signal?: AbortSignal;
  progress?: (stage: Stage, status: 'running' | 'passed') => void;
}): Promise<Report> {
  const report: Report = {
    version: 1, timestamp: new Date().toISOString(), permissionMode: options.mode, outcome: 'failed', checks: [],
    limits: [
      'This result applies to this app registration, account, device, permission set, and time.',
      'Sending, editing, drafts, folder sync, and long-term background access are not tested.',
      options.mode === 'read' ? 'Read-only success does not establish consent for Mail.ReadWrite or Mail.Send.' : 'Mail.ReadWrite and Mail.Send grants are checked, but no mail is sent or modified.',
      'Tokens are discarded when the probe ends. Discarding the cache does not revoke Microsoft consent.',
    ],
  };
  let stage: Stage = 'sign-in';
  const begin = (next: Stage) => { options.signal?.throwIfAborted(); stage = next; options.progress?.(stage, 'running'); };
  const pass = () => { options.signal?.throwIfAborted(); report.checks.push({ stage, status: 'passed' }); options.progress?.(stage, 'passed'); };
  try {
    begin('sign-in');
    let session = await options.auth.signIn();
    verifyScopes(session, options.mode);
    pass();
    begin('mailbox-read');
    await options.read(session.accessToken);
    pass();
    begin('token-refresh');
    session = await options.auth.refresh();
    verifyScopes(session, options.mode);
    if (session.fromCache) throw new ProbeFailure('REFRESH_NOT_VERIFIED', 'MSAL returned a cached access token. A network refresh was not verified.');
    pass();
    begin('refreshed-mailbox-read');
    await options.read(session.accessToken);
    pass();
    report.outcome = 'passed';
  } catch (error) {
    report.checks.push({ stage, status: 'failed', ...diagnose(error) });
  } finally {
    await options.auth.clear();
  }
  return report;
}
