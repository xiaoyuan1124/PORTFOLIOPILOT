# One-command TestFlight bootstrap

This helper exists so the Apple private key never needs to be pasted into chat or committed to Git.

Run on the Windows PC that holds the downloaded App Store Connect Team API private key:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-testflight.ps1
```

The script will:

1. verify GitHub CLI authentication and access to `xiaoyuan1124/PORTFOLIOPILOT`
2. ask for the Apple Team ID
3. ask for the App Store Connect Team API Key ID
4. ask for the App Store Connect Issuer ID
5. ask for the local path to the downloaded `AuthKey_*.p8`
6. create/update the dedicated GitHub Actions environment `portfolio-testflight`
7. store the four PortfolioPilot-only environment secrets
8. verify that all four secret names exist
9. read the exact Version / Build / Bundle ID from `main`
10. optionally dispatch the guarded `TestFlight Upload` workflow
11. wait for that exact workflow run and return success/failure

Use `-SkipUpload` to configure credentials without starting a real upload:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-testflight.ps1 -SkipUpload
```

## Apple values needed once

The Team ID is the Apple Developer Program Team ID.

For the App Store Connect API credentials, use a **Team API key**. In App Store Connect, Account Holder/Admin can go to **Users and Access → Integrations → App Store Connect API → Team Keys** and generate one. Apple only allows the private `.p8` key to be downloaded once, so store it outside the repository.

The script never prints or commits the private key contents. It reads the file locally, converts the bytes to Base64 in memory, and writes the encoded value directly to the dedicated GitHub environment secret.

## GitHub CLI

The helper requires `gh` to already be installed and authenticated. If `gh auth status` fails, run:

```powershell
gh auth login
```

Then rerun the helper.

## Safety boundaries

The helper is hard-coded to:

- repository: `xiaoyuan1124/PORTFOLIOPILOT`
- environment: `portfolio-testflight`
- bundle ID: `com.sy1124.portfoliopilot`
- workflow: `testflight-upload.yml`

It does not read, modify, or reuse another app's Bundle ID, provisioning profile, App Store Connect app ID, or GitHub deployment environment.
