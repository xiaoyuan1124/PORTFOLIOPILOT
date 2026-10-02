# PortfolioPilot TestFlight Upload

Baseline: V0.84.2

The repository contains a guarded, manual GitHub Actions workflow at
`.github/workflows/testflight-upload.yml`.

For the shortest Windows setup path, use `scripts/bootstrap-testflight.ps1`; it creates the dedicated environment, writes the four secrets from local input, verifies them, and can dispatch/watch the upload. See `docs/TESTFLIGHT_ONE_COMMAND.md`.

It is intentionally **not** triggered by pushes or pull requests. A real upload happens only when the workflow is manually dispatched from `main` and the confirmation input is exactly `UPLOAD`.

## Required Apple setup

PortfolioPilot must exist as its own App Store Connect app record with bundle ID:

`com.sy1124.portfoliopilot`

The Apple Developer account must also have a matching explicit App ID. Xcode automatic signing is allowed to manage the App Store Connect provisioning profile for this bundle ID when the API key has sufficient access.

Do not reuse another app's bundle ID or provisioning profile.

## Dedicated GitHub environment and secrets

Create a GitHub Actions environment named exactly:

`portfolio-testflight`

Store the Apple credentials as **environment secrets**, not shared repository secrets:

- `PORTFOLIOPILOT_APPLE_TEAM_ID`
- `PORTFOLIOPILOT_ASC_KEY_ID`
- `PORTFOLIOPILOT_ASC_ISSUER_ID`
- `PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64`

The workflow references only this environment, so PortfolioPilot does not depend on or reuse another app's GitHub deployment credentials.

If your GitHub plan/repository settings allow deployment protection rules, require manual approval for `portfolio-testflight` and restrict deployment to `main`.

The `.p8` private key is stored only as a base64-encoded GitHub Secret and is written to the temporary macOS runner directory at runtime. It is not committed, uploaded as an artifact, or printed.

Use a **Team App Store Connect API key**, not an Individual API key. Apple documents that Individual API keys cannot use Provisioning endpoints; PortfolioPilot's Xcode automatic-signing flow may need provisioning access. Build upload itself is permitted for Account Holder, Admin, App Manager, or Developer roles. Use the least-privileged Team key that successfully supports your signing/provisioning setup.

## Upload flow

1. Checkout the exact `main` commit.
2. Validate manual confirmation and required secrets.
3. Materialize the App Store Connect API private key in the runner temp directory.
4. Build the native static bundle and generate/verify the Capacitor iOS shell.
5. Resolve Swift packages.
6. Generate `ExportOptions-TestFlight.plist` with:
   - method: `app-store-connect`
   - destination: `upload`
   - signingStyle: `automatic`
   - the configured Apple Team ID
   - `manageAppVersionAndBuildNumber = false`, so Xcode cannot silently change the committed build identity
7. Create a signed Release archive using Xcode automatic signing plus App Store Connect API authentication.
8. Verify the signed archive's bundle ID, marketing version, build number, and code signature.
9. Export/upload the exact archive to App Store Connect.
10. Report the uploaded Git SHA and Version/Build identity.

The workflow does not increment the build number automatically. If another build of the same marketing version must be uploaded, first update `native/app-store.json` and merge that change so every upload remains traceable to a committed identity.

## GitHub Actions manual run

Run:

`TestFlight Upload`

Branch:

`main`

Confirmation:

`UPLOAD`

Bundle confirmation:

`com.sy1124.portfoliopilot`

If the app record, App ID, Team access, API key permissions, or automatic-signing relationship is incomplete, Xcode should fail the workflow before upload. Do not weaken signing checks just to make the workflow green.

## What happens after upload

A successful upload does not mean the build is immediately available. Apple processes uploaded builds before they appear in App Store Connect / TestFlight. TestFlight builds can be tested for up to 90 days. Internal testing can use eligible builds after processing; external testing may require Beta App Review.

## Current separation of evidence

PR CI proves the signing/upload CLI contract exists in the current Xcode toolchain without using secrets.

The manual TestFlight workflow proves real signing and upload only after it has been successfully run with the PortfolioPilot App Store Connect record and Apple credentials.


## Safe secret setup from a local terminal

Do not paste the private `.p8` contents into chat.

With GitHub CLI authenticated to the correct account, environment secrets can be set locally. Keep the original `.p8` file outside the repository. Convert it to base64 only in the local shell and pipe the value directly to `gh secret set`; do not commit the encoded value.

After all four secrets exist in `portfolio-testflight`, the next step is to create/confirm the PortfolioPilot App Store Connect record and run the guarded workflow from `main`.
