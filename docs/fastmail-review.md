# Fastmail connection review

## Scope

- Review base: [4ea06e7](https://github.com/maximilianpw/superlocal/commit/4ea06e7).
- Candidate: [5b99c7a](https://github.com/maximilianpw/superlocal/commit/5b99c7a). Initial feature evidence below was captured at [94e53cc](https://github.com/maximilianpw/superlocal/commit/94e53cc); review-fix evidence follows separately.
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

### Oracle findings resolved

- **P1:** The built-in now uses `builtin:fastmail`, outside the previously allowed custom-ID syntax. A custom `fastmail` preset retains its original configuration and identity hash; nothing is renamed or silently redirected.
- **P2:** Reconnect now requires explicit service selection, and progress/retry retains the original reconnect ID. The service selection survives retry, email remains read-only, and passwords are cleared.

| Reconnect scenario | Before fixes | After fixes |
| --- | --- | --- |
| Initial service selection | [Incorrect iCloud default](https://ampcode.com/user-content/artifacts/b49dd870eccd355858dc073b51484a7386ea52ee39193a31c1bcc7cb73baf44c-file.png) | [Required service choice](https://ampcode.com/user-content/artifacts/876174a7134120ea009a35ed47dd86d20d0f57640f1d6c267fcbb96704d1cf54-file.png) |
| Failed attempt → retry → second submission | [Loses reconnect target](https://ampcode.com/user-content/artifacts/92bb668d48e73fe4cf1827b91456c02be8b2131344efa344f0da36dbd42fd267-file.mp4) | [Retains reconnect target](https://ampcode.com/user-content/artifacts/faf9c84cb9fe47ce4b8ca79d881a23e430f71eb07c19fa41b3a547a73d6c569c-file.mp4) |
| Retry form | Becomes a new-connection form in the before clip | [Retained Fastmail and email, empty password](https://ampcode.com/user-content/artifacts/eb59e68f611a63c2c458b00186b6551327fce6b86bdf78c54680015184a53aff-file.png) |

Both recordings and screenshots inspected. Review-fix before: [7489756](https://github.com/maximilianpw/superlocal/commit/7489756), asset `index-Z2-jS4UB.js`; after: candidate above, asset `index-CKm0HM1M.js`. Same optimized build mode, dark/comfortable settings, 1280 × 900 viewport and 100% zoom. This focused fixture adds one fictional `reader@example.test` source/connection and zero messages to the empty real-mode host. Browser fixtures/proxy override only account metadata and intercept provider operations; no real account is accessed. Videos use the same isolated QA proxy/preview; screenshots use equivalent browser-injected metadata.

Executed DOM/request checks: empty service choice is required, focuses `preset`, and sends no request. After failure, retry keeps `builtin:fastmail`, the read-only email and an empty password. Both fixed submissions use `/host/providers/imap/connections/fictional-fastmail-connection/reconnect`; before the fix, the second request used `/host/providers/imap/connect`. These URL assertions were confirmed by both browser capture and content-free proxy logs, not inferred from video.

## Performance and correctness

- `bun --no-env-file run typecheck && bun --no-env-file run build` — passed.
- `bun --no-env-file run typecheck:host` — passed.
- `bun --no-env-file run start` — optimized web build and host startup passed; latest candidate asset `index-CKm0HM1M.js` confirmed in browser.
- `bun --no-env-file run test:web` — 68 passed, 0 failed.
- `INBOX_TEST_LIVE=false bun --no-env-file test packages/inbox-sdk/tests/provider.test.ts --test-name-pattern 'imap'` — 106 passed, 0 failed during initial feature verification, including SMTP/APPEND ownership and partial-result regressions. The unchanged adapter suite was not repeated for the review fixes.
- Targeted `IMAP host onboarding` API cases — 2 passed. Expanded regression uses actual SDK persistence and host reload (only native IMAP account/folder I/O is mocked): legacy endpoints, custom usernames and Sent policy survive; wrong preset and authentication failure preserve the credential version; successful password replacement preserves connection identity, source IDs and the existing mailbox.
- `INBOX_TEST_LIVE=false bun --no-env-file run test:api` — latest run **249 passed, 1 failed**. The unchanged AI-triage test `paused 10000-thread history leaves a signed 32-arrival prefix committed and drains the 33rd arrival without rollback starvation` exceeded its 5000ms timeout (~5110ms), followed by a closed-database cleanup error. During initial verification, the same isolated test failed on the feature (~5173ms) and a separately installed untouched base (~5170ms). No timeout, budget, data size or assertions were relaxed.
- Runtime: Bun 1.4.0, Node 26.5.1, Headless Chrome 152, Linux x64 orb, 2 vCPU Intel Xeon @ 2.60GHz.
- Mailbox performance measurement N/A: no query, reconciliation, cache, selector, virtualization, email rendering or timing-log changes. This is connection-form/preset work; empty onboarding is not presented as a scale benchmark.
- Live Fastmail authentication/sync/send/reconnect remains unqualified without a dedicated account/app password. No mail or DNS was changed. Alias sender selection is not implemented by this preset.
- Existing custom `fastmail` presets remain valid. The built-in ID changed before release; no real connections were created with the earlier draft-only ID during this work.

## Review gate

- [x] Branch contains only the requested change and its review evidence.
- [x] Matching before/after evidence is attached, inspected and reviewable.
- [x] Published media contains only fictional/empty fixture data; no private mail, secrets or logs.
- [ ] All required regressions pass — baseline API timeout above remains unresolved.
- [x] No unexpected visual differences found in affected forms.
- Reviewer approval pending. Keep draft; no merge or deployment performed.
