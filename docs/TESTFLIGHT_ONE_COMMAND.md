# PortfolioPilot TestFlight preparation — eight signing secrets

**Current launch identity: 1.0.0 (1). This is not yet an Apple-signed build.**

## iPhone: safe preflight (does not upload)

Open [TestFlight Preflight (No Upload)](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/workflows/testflight-preflight.yml) → Run workflow → main. In Safari, request the desktop version if the Run workflow menu is hidden.

The check runs inside the isolated portfolio-testflight GitHub Environment. It verifies the release identity, protected upload guard, App Groups, and whether eight encrypted signing secret entries are nonempty. **It never prints secret values or initiates signing/upload.** Nonempty secrets do not prove that a certificate or password is valid.

Eight required secret names:

1. PORTFOLIOPILOT_APPLE_TEAM_ID
2. PORTFOLIOPILOT_ASC_KEY_ID
3. PORTFOLIOPILOT_ASC_ISSUER_ID
4. PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64
5. PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_BASE64
6. PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_PASSWORD
7. PORTFOLIOPILOT_IOS_APP_STORE_PROFILE_BASE64
8. PORTFOLIOPILOT_IOS_WIDGET_PROFILE_BASE64

Configure them privately at [GitHub Environments](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/settings/environments). The main App and Widget need separate App Store profiles with the same Apple Team and shared App Group. Apple `.cer` alone is insufficient because signing requires the matching private key.

## Windows helper, if a PC is available

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-testflight.ps1 -SkipUpload
```

This helper configures **only the first four App Store Connect API secrets** from local inputs. It now checks for the other four signing entries and **refuses to trigger TestFlight with only four**. The -SkipUpload switch never uploads. See [manual distribution signing](./TESTFLIGHT_MANUAL_SIGNING_AND_FREE_ACTIONS.md) to provision the Distribution .p12, password and the two independent Apple-issued App Store profiles. Do not paste the credentials into chat, Issues, PRs or online converters.

## Real Apple upload (account holder)

First verify App Store Connect does not already contain build 1.0.0 (1); if it does, increment the committed build number on a reviewed change. Then open [TestFlight Upload](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/workflows/testflight-upload.yml) from latest main, input UPLOAD and com.sy1124.portfoliopilot. The production workflow checks actual certificate/profiles and signed archive. After Apple processing, install the exact build on an iPhone and complete [device acceptance](./NATIVE_DEVICE_VALIDATION.md) before App Store Review.

Successful preflight is NOT successful Apple signing, TestFlight installation or App Review. All three must be separately confirmed.
