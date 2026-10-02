# PortfolioPilot TestFlight Upload

Baseline: V0.84.1

The repository contains a guarded, manual GitHub Actions workflow at
`.github/workflows/testflight-upload.yml`.

It is intentionally **not** triggered by pushes or pull requests. A real upload happens only when the workflow is manually dispatched from `main` and the confirmation input is exactly `UPLOAD`.

## Required Apple setup

PortfolioPilot must exist as its own App Store Connect app record with bundle ID:

`com.sy1124.portfoliopilot`

The Apple Developer account must also have a matching explicit App ID. Xcode automatic signing is allowed to manage the App Store Connect provisioning profile for this bundle ID when the API key has sufficient access.

Do not reuse another app's bundle ID or provisioning profile.

## Required GitHub Secrets

Configure these repository secrets before the first real upload:

- `APPLE_TEAM_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8_BASE64`

The `.p8` private key is stored only as a base64-encoded GitHub Secret and is written to the temporary macOS runner directory at runtime. It is not committed, uploaded as an artifact, or printed.

Recommended: use a Team App Store Connect API key with the minimum role that still permits build upload and signing/provisioning operations required by the workflow.

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

If the app record, App ID, Team access, API key permissions, or automatic-signing relationship is incomplete, Xcode should fail the workflow before upload. Do not weaken signing checks just to make the workflow green.

## What happens after upload

A successful upload does not mean the build is immediately available. Apple processes uploaded builds before they appear in App Store Connect / TestFlight. TestFlight builds can be tested for up to 90 days. Internal testing can use eligible builds after processing; external testing may require Beta App Review.

## Current separation of evidence

PR CI proves the signing/upload CLI contract exists in the current Xcode toolchain without using secrets.

The manual TestFlight workflow proves real signing and upload only after it has been successfully run with the PortfolioPilot App Store Connect record and Apple credentials.
