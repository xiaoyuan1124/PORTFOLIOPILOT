import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSignedWidgetContract, WIDGET_GROUP_ID } from "./widget-signing-contract.mjs";

const team = "A1B2C3D4E5";
const root = "com.sy1124.portfoliopilot";
const metadata = { bundleId: root, version: "0.91.0", buildNumber: "1" };
const date = new Date("2026-10-23T00:00:00.000Z");
function signed(id) {
  return {
    "application-identifier": team + "." + id,
    "com.apple.developer.team-identifier": team,
    "com.apple.security.application-groups": [WIDGET_GROUP_ID],
    "get-task-allow": false
  };
}
function provision(id) {
  return {
    Entitlements: {
      "application-identifier": team + "." + id,
      "com.apple.security.application-groups": [WIDGET_GROUP_ID]
    },
    TeamIdentifier: [team],
    ExpirationDate: "2027-10-23T00:00:00.000Z"
  };
}
function fixture() {
  return {
    metadata, teamId: team, now: date,
    hostInfo: {
      CFBundleIdentifier: root, CFBundleShortVersionString: "0.91.0",
      CFBundleVersion: "1"
    },
    widgetInfo: {
      CFBundleIdentifier: root + ".widgets",
      CFBundleShortVersionString: "0.91.0", CFBundleVersion: "1",
      NSExtension: { NSExtensionPointIdentifier: "com.apple.widgetkit-extension" }
    },
    hostEntitlements: signed(root),
    widgetEntitlements: signed(root + ".widgets"),
    hostProfile: provision(root),
    widgetProfile: provision(root + ".widgets")
  };
}

test("correct release app + extension entitlements and profiles pass", () => {
  assert.doesNotThrow(() => assertSignedWidgetContract(fixture()));
});
test("missing WidgetKit group entitlement in signature fails closed", () => {
  const d = fixture();
  d.widgetEntitlements["com.apple.security.application-groups"] = [];
  assert.throws(() => assertSignedWidgetContract(d), /Widget Extension: signed App Groups/);
});
test("missing host group authorization in Apple profile fails closed", () => {
  const d = fixture();
  d.hostProfile.Entitlements["com.apple.security.application-groups"] = [];
  assert.throws(() => assertSignedWidgetContract(d), /Host App: App Group missing from the provisioning profile/);
});
test("a valid host profile cannot substitute for the extension profile", () => {
  const d = fixture();
  d.widgetProfile = d.hostProfile;
  assert.throws(() => assertSignedWidgetContract(d), /Widget Extension: provisioning profile belongs/);
});
test("expired signing or unexpected Apple Team is rejected", () => {
  const d = fixture();
  d.hostProfile.ExpirationDate = "2025-01-01T00:00:00Z";
  assert.throws(() => assertSignedWidgetContract(d), /expired/);
  const wrong = fixture();
  wrong.widgetEntitlements["com.apple.developer.team-identifier"] = "1111111111";
  assert.throws(() => assertSignedWidgetContract(wrong), /signed Team ID/);
});
test("debug-signed WidgetKit target cannot ship to TestFlight", () => {
  const d = fixture();
  d.widgetEntitlements["get-task-allow"] = true;
  assert.throws(() => assertSignedWidgetContract(d), /debug\/development/);
});
test("wrong widget extension identifier, version or build number is rejected", () => {
  const d = fixture();
  d.widgetInfo.CFBundleIdentifier = "com.another.widget";
  assert.throws(() => assertSignedWidgetContract(d), /Widget bundle ID mismatch/);
  const badVersion = fixture();
  badVersion.widgetInfo.CFBundleShortVersionString = "1.0.0";
  assert.throws(() => assertSignedWidgetContract(badVersion), /Widget version mismatch/);
  const badBuild = fixture();
  badBuild.widgetInfo.CFBundleVersion = "2";
  assert.throws(() => assertSignedWidgetContract(badBuild), /Widget build number mismatch/);
});
import * as privacyContract from "./widget-signing-contract.mjs";

test("App Group UserDefaults privacy reason must be declared in each shipping bundle", () => {
  const manifest = reasons => ({ NSPrivacyAccessedAPITypes: [{
    NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
    NSPrivacyAccessedAPITypeReasons: reasons
  }] });
  assert.doesNotThrow(() => privacyContract.assertAppGroupPrivacyManifest(manifest(["CA92.1", "1C8F.1"])));
  assert.doesNotThrow(() => privacyContract.assertAppGroupPrivacyManifest(manifest(["1C8F.1"])));
  for (const invalid of [{}, manifest(["CA92.1"]), {
    NSPrivacyAccessedAPITypes: [{NSPrivacyAccessedAPIType: "Other", NSPrivacyAccessedAPITypeReasons: ["1C8F.1"]}]
  }]) assert.throws(() => privacyContract.assertAppGroupPrivacyManifest(invalid), /App Group/);
});
