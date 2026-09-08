import { PublicClientApplication, type AccountInfo, type AuthenticationResult } from '@azure/msal-node';
import type { OutlookPermissionMode as PermissionMode } from '../../shared/outlook-probe';
import { mailScopes, ProbeFailure, type Authentication, type Session } from './outlook-probe-checks';
import { MicrosoftNetwork } from './outlook-probe-network';

export function createMicrosoftAuthentication(options: {
  clientId: string;
  tenantId: string;
  mode: PermissionMode;
  signal: AbortSignal;
  authorize: (makeUrl: (request: { redirectUri: string; state: string; challenge: string }) => Promise<string>) => Promise<{ code: string; verifier: string; redirectUri: string }>;
}): Authentication {
  const client = new PublicClientApplication({
    auth: { clientId: options.clientId, authority: `https://login.microsoftonline.com/${options.tenantId}` },
    system: { networkClient: new MicrosoftNetwork(options.signal), loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
  });
  const scopes = mailScopes(options.mode);
  let account: AccountInfo | undefined;
  const session = (result: AuthenticationResult): Session => {
    if (!result.account || result.tenantId.toLowerCase() !== options.tenantId.toLowerCase()) {
      throw new ProbeFailure('WRONG_TENANT', 'The token response did not identify an account in the configured tenant.');
    }
    account = result.account;
    return { accessToken: result.accessToken, grantedScopes: result.scopes, fromCache: result.fromCache };
  };
  return {
    async signIn() {
      const authorization = await options.authorize(request => client.getAuthCodeUrl({
          scopes: [...scopes, 'openid', 'profile', 'offline_access'],
          redirectUri: request.redirectUri,
          state: request.state,
          codeChallenge: request.challenge,
          codeChallengeMethod: 'S256',
          responseMode: 'query',
          prompt: 'select_account',
        }));
      options.signal.throwIfAborted();
      return session(await client.acquireTokenByCode({
        code: authorization.code, codeVerifier: authorization.verifier,
        redirectUri: authorization.redirectUri, scopes,
      }));
    },
    async refresh() {
      if (!account) throw new ProbeFailure('NO_ACCOUNT', 'Complete sign-in before testing refresh.');
      const previousAccount = account.homeAccountId;
      const result = await client.acquireTokenSilent({ account, scopes, forceRefresh: true });
      if (result.account?.homeAccountId !== previousAccount) throw new ProbeFailure('ACCOUNT_CHANGED', 'The refresh response identified a different account.');
      return session(result);
    },
    async clear() { account = undefined; await client.clearCache(); },
  };
}
