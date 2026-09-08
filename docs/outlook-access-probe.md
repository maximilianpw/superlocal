# Test Outlook work-account access

In **Settings → Add Accounts → Outlook · Access test**, enter your Entra
application (client) ID and directory (tenant) ID. These are identifiers, not
passwords. Use an app registration intended for Superlocal in your organization.
Do not borrow another application's client ID or enter a client secret.

In the registration's Authentication settings, add **Mobile and desktop
applications** and the exact redirect address shown under **Microsoft app setup**
in Superlocal. For the default local installation this is:

```text
http://localhost:5178/host/outlook-probe/callback
```

Use delegated Microsoft Graph `Mail.Read` for the read-only test. The optional
full-client consent test requests `Mail.ReadWrite` and `Mail.Send`. The host also
requests the sign-in scopes and `offline_access` needed to check token refresh.
This prototype supports the public Microsoft cloud and the configured localhost
installation. It does not accept personal Microsoft accounts, national-cloud
endpoints or hosted installations using a non-localhost origin.

Choose **Start Outlook test**, then **Continue to Microsoft**. Sign in with your
work account and review Microsoft's consent screen. Return to Superlocal to see:

1. Sign-in and the requested mail grants.
2. A mailbox read selecting at most one message ID.
3. A forced network refresh through MSAL.
4. Another mailbox read using the refreshed access token.

An empty mailbox can pass. Subjects, message bodies and attachments are not read.
The full-client test verifies grants but does not send, edit or delete anything.
The test does not create a connected Superlocal mailbox or persist tokens. The
host discards its in-memory token cache when the attempt finishes, is cancelled
or reaches its ten-minute deadline. Discarding tokens does not revoke consent in
Microsoft Entra. Content-free results remain available in memory for up to thirty
minutes and disappear when the host restarts.

If the Microsoft tab did not open, use **Open Microsoft again**. Cancel and start
again if you need a new sign-in attempt. If the host becomes unavailable, retry
the status check or return to the provider list; an unfinished attempt expires.

The result describes this app, account, device, permission set and time. A
read-only pass does not establish permission to send or edit, and an immediate
refresh does not prove that long-running background access will be allowed.
Administrator consent, app assignment and Conditional Access can still require
IT involvement. The UI displays a safe Microsoft error code and guidance without
exposing the provider's raw response. A timeout or service error is not evidence
that your organization blocks the integration.

Microsoft references: [desktop configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration),
[listing messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0).
