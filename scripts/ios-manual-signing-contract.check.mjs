import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_BUNDLE_ID, WIDGET_BUNDLE_ID, APP_GROUP_ID,
  HOST_RELEASE_ID, WIDGET_RELEASE_ID,
  assertAppStoreProfile, setManualReleaseSigning, appStoreExportOptions
} from "./ios-manual-signing-contract.mjs";

const team = "A1B2C3D4E5";
function profile(bundle, name = "Portfolio TestFlight") {
  return {
    UUID: "11111111-2222-3333-4444-555555555555", Name: name,
    TeamIdentifier: [team], ExpirationDate: "2030-10-23T00:00:00Z",
    DeveloperCertificates: ["base64cert"],
    Entitlements: {
      "application-identifier": team + "." + bundle,
      "get-task-allow": false,
      "com.apple.security.application-groups": [APP_GROUP_ID]
    }
  };
}
function pbx() {
  return [HOST_RELEASE_ID, WIDGET_RELEASE_ID].map(id =>
    "\t\t" + id + " /* Release */ = {\n" +
    "\t\t\tisa = XCBuildConfiguration;\n" +
    "\t\t\tbuildSettings = {\n" +
    '\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n' +
    "\t\t\t\tCODE_SIGN_STYLE = Automatic;\n" +
    "\t\t\t};\n" +
    "\t\t\tname = Release;\n" +
    "\t\t};").join("\n");
}
test("valid App Store host and widget profiles are accepted", () => {
  assert.equal(assertAppStoreProfile(profile(APP_BUNDLE_ID), team, APP_BUNDLE_ID).name,
    "Portfolio TestFlight");
  assert.doesNotThrow(() =>
    assertAppStoreProfile(profile(WIDGET_BUNDLE_ID), team, WIDGET_BUNDLE_ID));
});
test("wrong bundle, missing group, development, ad-hoc, enterprise, expired profiles rejected", () => {
  const badId = profile(WIDGET_BUNDLE_ID);
  assert.throws(() => assertAppStoreProfile(badId, team, APP_BUNDLE_ID), /App ID/);
  const noGroup = profile(APP_BUNDLE_ID);
  noGroup.Entitlements["com.apple.security.application-groups"] = [];
  assert.throws(() => assertAppStoreProfile(noGroup, team, APP_BUNDLE_ID), /App Groups/);
  for (const change of [
    p => { p.Entitlements["get-task-allow"] = true; },
    p => { p.ProvisionedDevices = ["dummy"]; },
    p => { p.ProvisionsAllDevices = true; },
    p => { p.ExpirationDate = "2020-01-01T00:00:00Z"; },
    p => { p.DeveloperCertificates = []; },
    p => { p.TeamIdentifier = ["ZZZZZZZZZZ"]; }
  ]) {
    const p = profile(APP_BUNDLE_ID);
    change(p);
    assert.throws(() => assertAppStoreProfile(p, team, APP_BUNDLE_ID));
  }
});
test("manual release patch selects only host and widget profiles", () => {
  const result = setManualReleaseSigning(pbx(), team, "Portfolio Host AppStore", "Portfolio Widgets AppStore");
  assert.equal(result.match(/CODE_SIGN_STYLE = Manual;/g)?.length, 2);
  assert.equal(result.match(/PROVISIONING_PROFILE_SPECIFIER = /g)?.length, 2);
  assert(result.includes('PROVISIONING_PROFILE_SPECIFIER = "Portfolio Host AppStore";'));
  assert(result.includes('PROVISIONING_PROFILE_SPECIFIER = "Portfolio Widgets AppStore";'));
});
test("reject unknown targets and double configuration", () => {
  assert.throws(() => setManualReleaseSigning(pbx().replace(HOST_RELEASE_ID, "FOO"), team, "Host", "Widget"), /App Release/);
  assert.throws(() => setManualReleaseSigning(setManualReleaseSigning(pbx(), team, "Host", "Widget"), team, "Host", "Widget"));
});
test("App Store export maps both profiles without XML injection", () => {
  const xml = appStoreExportOptions(team, 'A&B <Host>', 'Widget "Private"');
  assert(xml.includes("<string>manual</string>"));
  assert(xml.includes("<string>Apple Distribution</string>"));
  assert(xml.includes("A&amp;B &lt;Host&gt;"));
  assert(xml.includes("Widget &quot;Private&quot;"));
  assert(xml.includes(WIDGET_BUNDLE_ID));
});
