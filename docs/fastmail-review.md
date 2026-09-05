# Fastmail connection review

## Scope

- Review base: [4ea06e7](https://github.com/maximilianpw/superlocal/commit/4ea06e7).
- Candidate: [94e53cc](https://github.com/maximilianpw/superlocal/commit/94e53cc).
- [x] UIPR — visible account onboarding and interaction change.
- Add a trusted Fastmail preset to the existing IMAP connection flow; preserve iCloud and custom presets.
- One Fastmail login connects one mailbox, including incoming mail for its custom-domain aliases. This does not add alias discovery or a sender-identity picker.
- No DNS changes, real credentials, real messages, migration, merge or deployment.
- Baseline: optimized `bun --no-env-file run start`, isolated empty real-mode host (zero connections/messages), 1280 × 900 viewport, 100% zoom, dark Superlocal theme, comfortable density. The empty fixture exercises onboarding, not mailbox performance.
- Served baseline asset: `index-CWPNzOho.js`.
- Expected changes: Fastmail in Mail service selection; Fastmail login/app-password help; trusted TLS endpoints and IMAP APPEND Sent copy. Fastmail's optional SMTP-copy preference must be off to avoid duplicates.
- The referenced personal-design skill was unavailable; use existing Settings components/styles.

## Before and after

![Baseline iCloud connection form](https://ampcode.com/user-content/artifacts/12a04981af3e936c21d4b3091fa91248deb23fb73a7c448c9e56d800690fbac3-file.png)

[Baseline navigation to Add accounts](https://ampcode.com/user-content/artifacts/746f35b1197e86801ea311b321be6ff35f79a14cd8eaf5584ea898f835ad19a0-file.mp4). The clip shows entry into Settings; the screenshot captures the subsequent credential form. Both inspected; no mail or credentials present.

| Scenario | Before | After |
| --- | --- | --- |
| iCloud credentials | Baseline image above | [Preserved iCloud form with selector](https://ampcode.com/user-content/artifacts/45bee9a31c8c48bff13408f166feb4137c48db132126519fbb02a9e483547486-file.png) |
| Fastmail | Not available | [Fastmail form](https://ampcode.com/user-content/artifacts/54318d79893e8e6fe6a2e142d7f08f2a0163b0217964f27fcf70d755c7bf1ccf-file.png) |
| Provider selection | Baseline navigation clip above | [iCloud → Fastmail → iCloud → Fastmail](https://ampcode.com/user-content/artifacts/89bfbf59a3f91e7ee4376fea1af846d99c39ef5e00cfc11decf56d4c87e61731-file.mp4) |
| Synthetic offline failure | Existing error flow unchanged | [Error with retry/provider choice](https://ampcode.com/user-content/artifacts/d719093cf08022f8d4bbd643d8686316cf904947a95093ae6a5d5b1e057143dd-file.png) |

Matching screenshots and selection clip inspected: guidance swaps correctly, forms readable with no overlap/clipping. Empty submit marks both fields invalid and DOM focus lands on `email`. Password input is masked and required. Browser-aborted connection uses fictional credentials and shows `Failed to fetch`, `Try again`, and `Choose another provider`; no success is fabricated. No actual Fastmail request was made by this browser test.

## Performance and correctness

- `bun --no-env-file run typecheck && bun --no-env-file run build` — passed.
- `bun --no-env-file run typecheck:host` — passed.
- `bun --no-env-file run start` — optimized web build and host startup passed; candidate served asset `index-Z2-jS4UB.js` confirmed in browser. Same fixture, viewport, zoom, theme and density as base.
- `bun --no-env-file run test:web` — 68 passed, 0 failed.
- `INBOX_TEST_LIVE=false bun --no-env-file test packages/inbox-sdk/tests/provider.test.ts --test-name-pattern 'imap'` — 106 passed, 0 failed, including SMTP/APPEND ownership and partial-result regressions.
- Targeted `IMAP host onboarding` API cases — 2 passed: iCloud compatibility, Fastmail TLS/login/Sent policy, password preservation, auth/duplicate errors, endpoint override rejection, reserved and custom preset IDs.
- `INBOX_TEST_LIVE=false bun --no-env-file run test:api` — **249 passed, 1 failed**. The unchanged AI-triage test `paused 10000-thread history leaves a signed 32-arrival prefix committed and drains the 33rd arrival without rollback starvation` exceeded its 5000ms timeout, followed by a closed-database cleanup error. The same isolated test fails on both candidate (~5173ms) and a separately installed untouched base (~5170ms). No timeout, budget, data size or assertions were relaxed.
- Runtime: Bun 1.4.0, Node 26.5.1, Headless Chrome 152, Linux x64 orb, 2 vCPU Intel Xeon @ 2.60GHz.
- Mailbox performance measurement N/A: no query, reconciliation, cache, selector, virtualization, email rendering or timing-log changes. This is connection-form/preset work; empty onboarding is not presented as a scale benchmark.
- Live Fastmail authentication/sync/send/reconnect remains unqualified without a dedicated account/app password. No mail or DNS was changed. Alias sender selection is not implemented by this preset.
- Compatibility limit: custom presets already named `fastmail` now fail configuration validation rather than being silently redirected; see README.

## Review gate

- [x] Branch contains only the requested change and its review evidence.
- [x] Matching before/after evidence is attached, inspected and reviewable.
- [x] Published media contains only fictional/empty fixture data; no private mail, secrets or logs.
- [ ] All required regressions pass — baseline API timeout above remains unresolved.
- [x] No unexpected visual differences found in affected forms.
- Reviewer approval pending. Keep draft; no merge or deployment performed.
