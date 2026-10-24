import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

export const RELEASE_APP_ID = "com.sy1124.portfoliopilot";
export const RELEASE_WIDGET_ID = RELEASE_APP_ID + ".widgets";
export const RELEASE_APP_GROUP = "group." + RELEASE_APP_ID;

export const REQUIRED_TESTFLIGHT_SECRETS = Object.freeze([
  "PORTFOLIOPILOT_APPLE_TEAM_ID",
  "PORTFOLIOPILOT_ASC_KEY_ID",
  "PORTFOLIOPILOT_ASC_ISSUER_ID",
  "PORTFOLIOPILOT_ASC_API_KEY_P8_BASE64",
  "PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_BASE64",
  "PORTFOLIOPILOT_IOS_DISTRIBUTION_P12_PASSWORD",
  "PORTFOLIOPILOT_IOS_APP_STORE_PROFILE_BASE64",
  "PORTFOLIOPILOT_IOS_WIDGET_PROFILE_BASE64"
]);

export function releaseMetadataProblems({
  metadata, packageJson, capacitorConfig, hostEntitlements, widgetEntitlements, uploadWorkflow
}) {
  const problems = [];
  function requireValue(condition, message) { if (!condition) problems.push(message); }
  requireValue(metadata?.version === "1.0.0" && metadata?.buildNumber === "1",
    "App Store candidate must be version 1.0.0 (1); do not silently reuse or bump identity.");
  requireValue(packageJson?.version === metadata?.version,
    "package.json and native/app-store.json versions differ.");
  requireValue(metadata?.bundleId === RELEASE_APP_ID,
    "PortfolioPilot App Bundle ID changed unexpectedly.");
  requireValue(String(capacitorConfig).includes('appId: "' + RELEASE_APP_ID + '"'),
    "Capacitor app ID does not match the release Bundle ID.");
  for (const [label, content] of [
    ["Main App", hostEntitlements], ["WidgetKit", widgetEntitlements]
  ]) {
    requireValue(String(content).includes(RELEASE_APP_GROUP),
      label + " App Group entitlement missing.");
  }
  requireValue(String(uploadWorkflow).includes('test "$CONFIRM_UPLOAD" = "UPLOAD"'),
    "Manual TestFlight upload confirmation guard missing.");
  requireValue(String(uploadWorkflow).includes('test "$CONFIRM_BUNDLE_ID" = "' + RELEASE_APP_ID + '"'),
    "TestFlight Bundle ID confirmation guard missing.");
  requireValue(String(uploadWorkflow).includes('test "$GITHUB_REF" = "refs/heads/main"'),
    "Upload must remain restricted to main.");
  requireValue(String(uploadWorkflow).includes("portfolio-testflight"),
    "Upload must use the isolated portfolio-testflight environment.");
  requireValue(String(uploadWorkflow).includes("Remove temporary private signing assets"),
    "Signing cleanup step is missing.");
  for (const key of REQUIRED_TESTFLIGHT_SECRETS) {
    requireValue(String(uploadWorkflow).includes("secrets." + key),
      "TestFlight workflow does not reference required secret: " + key);
  }
  return problems;
}

export function checkReleaseContract(root = process.cwd()) {
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const problems = releaseMetadataProblems({
    metadata: JSON.parse(read("native/app-store.json")),
    packageJson: JSON.parse(read("package.json")),
    capacitorConfig: read("capacitor.config.ts"),
    hostEntitlements: read("native/ios/App.entitlements"),
    widgetEntitlements: read("native/ios/widget/PortfolioPilotWidgets.entitlements"),
    uploadWorkflow: read(".github/workflows/testflight-upload.yml")
  });
  assert.deepEqual(problems, [],
    "PortfolioPilot release contract failure:\n" + problems.join("\n"));
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkReleaseContract();
  console.log("PASS: PortfolioPilot 1.0.0 (1) release identity, App Group, guarded upload and eight secret references.");
  console.log("UNVERIFIED: Apple secret values, signed archive, Apple processing and iPhone installation.");
}
