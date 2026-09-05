# Fastmail connection review

## Baseline and scope

- Review base: [4ea06e7](https://github.com/maximilianpw/superlocal/commit/4ea06e7).
- Add a trusted Fastmail preset to the existing IMAP connection flow; preserve iCloud and custom presets.
- One Fastmail login connects one mailbox, including incoming mail for its custom-domain aliases. This does not add alias discovery or a sender-identity picker.
- No DNS changes, real credentials, real messages, migration, merge or deployment.
- Baseline: optimized `bun --no-env-file run start`, isolated empty real-mode host (zero connections/messages), 1280 × 900 viewport, 100% zoom, dark Superlocal theme, comfortable density. The empty fixture exercises onboarding, not mailbox performance.
- Served baseline asset: `index-CWPNzOho.js`.
- Expected changes: Fastmail in Mail service selection; Fastmail login/app-password help; trusted TLS endpoints and server-managed Sent copy.
- The referenced personal-design skill was unavailable; use existing Settings components/styles.

## Before

![Baseline iCloud connection form](https://ampcode.com/user-content/artifacts/12a04981af3e936c21d4b3091fa91248deb23fb73a7c448c9e56d800690fbac3-file.png)

[Baseline navigation to Add accounts](https://ampcode.com/user-content/artifacts/746f35b1197e86801ea311b321be6ff35f79a14cd8eaf5584ea898f835ad19a0-file.mp4). The clip shows entry into Settings; the screenshot captures the subsequent credential form. Both inspected; no mail or credentials present.

## Candidate

Implementation and matching after evidence pending. Keep the PR draft until checks and evidence are complete, and obtain reviewer approval before shipping.
