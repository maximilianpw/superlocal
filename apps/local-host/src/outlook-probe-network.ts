import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from '@azure/msal-node';
import { ProbeFailure } from './outlook-probe-checks';

/** MSAL owns protocol validation. This adapter bounds network requests and disables redirects. */
export class MicrosoftNetwork implements INetworkModule {
  constructor(private readonly signal: AbortSignal) {}
  sendGetRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    return this.send<T>(url, 'GET', options);
  }
  sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    return this.send<T>(url, 'POST', options);
  }
  private async send<T>(url: string, method: 'GET' | 'POST', options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    if (new URL(url).origin !== 'https://login.microsoftonline.com') {
      throw new ProbeFailure('AUTHORITY_REJECTED', 'The authentication request targeted an unexpected host.');
    }
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(url, {
        method, headers: options?.headers ?? {}, ...(options?.body ? { body: options.body } : {}),
        redirect: 'error', signal: AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]),
      });
      body = await response.json();
    } catch {
      this.signal.throwIfAborted();
      throw new ProbeFailure('MICROSOFT_NETWORK_ERROR', 'Microsoft authentication could not return JSON within 15 seconds. Check connectivity and retry.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ProbeFailure('INVALID_MICROSOFT_RESPONSE', 'Microsoft authentication returned an unexpected response.');
    }
    // INetworkModule is generic: MSAL selects T and validates each discovery/token payload.
    // The assertion stays inside this transport boundary; callers only see validated sessions.
    return { body: body as T, headers: Object.fromEntries(response.headers), status: response.status };
  }
}
