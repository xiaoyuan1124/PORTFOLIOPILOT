import assert from "node:assert/strict";

export const APP_BUNDLE_ID = "com.sy1124.portfoliopilot";
export const WIDGET_BUNDLE_ID = APP_BUNDLE_ID + ".widgets";
export const APP_GROUP_ID = "group.com.sy1124.portfoliopilot";
export const HOST_RELEASE_ID = "504EC3181FED79650016851F";
export const WIDGET_RELEASE_ID = "F0B10000000000000000000E";

export function assertAppStoreProfile(profile, teamId, bundleId, now = new Date()) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "Invalid Apple Team ID");
  assert([APP_BUNDLE_ID, WIDGET_BUNDLE_ID].includes(bundleId), "Unexpected bundle ID");
  assert(profile && typeof profile === "object", "Profile does not decode to a plist");
  assert(profile.Entitlements && typeof profile.Entitlements === "object", "Profile entitlements missing");
  assert(Array.isArray(profile.TeamIdentifier) && profile.TeamIdentifier.includes(teamId),
    "Provisioning profile has the wrong Apple team");
  assert.equal(profile.Entitlements["application-identifier"], teamId + "." + bundleId,
    "Provisioning profile has the wrong explicit App ID");
  assert.equal(profile.Entitlements["get-task-allow"], false,
    "Development profiles cannot be used for TestFlight");
  assert(Array.isArray(profile.Entitlements["com.apple.security.application-groups"]) &&
    profile.Entitlements["com.apple.security.application-groups"].includes(APP_GROUP_ID),
    "App Groups entitlement missing from App Store provisioning profile");
  assert(!Array.isArray(profile.ProvisionedDevices) && profile.ProvisionsAllDevices !== true,
    "Ad Hoc / development / enterprise profiles are not App Store profiles");
  assert(Array.isArray(profile.DeveloperCertificates) && profile.DeveloperCertificates.length > 0,
    "Profile does not contain an Apple distribution certificate");
  assert(Number.isFinite(Date.parse(profile.ExpirationDate)) &&
    Date.parse(profile.ExpirationDate) > now.getTime(), "Provisioning profile expired");
  assert(/^[0-9A-Fa-f-]{36}$/.test(profile.UUID ?? ""), "Provisioning profile UUID missing");
  assert(typeof profile.Name === "string" && profile.Name.length > 0 &&
    profile.Name.length < 160 && !/[\u0000-\u001f]/.test(profile.Name),
    "Provisioning profile name invalid");
  return { name: profile.Name, uuid: profile.UUID };
}

function quotePbx(s) {
  assert(typeof s === "string" && s.length > 0 && s.length < 160 &&
    !/[\u0000-\u001f]/.test(s), "Invalid Xcode provisioning profile name");
  return JSON.stringify(s);
}

export function setManualReleaseSigning(pbx, teamId, hostName, widgetName) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "Invalid Apple Team ID");
  for (const [target, id, profileName] of [
    ["App", HOST_RELEASE_ID, hostName],
    ["WidgetKit", WIDGET_RELEASE_ID, widgetName]
  ]) {
    const head = "\t\t" + id + " /* Release */ = {";
    const begin = pbx.indexOf(head);
    assert(begin !== -1 && pbx.indexOf(head, begin + head.length) === -1,
      "Cannot safely locate " + target + " Release config");
    const end = pbx.indexOf("\n\t\t};", begin);
    assert(end !== -1, "Release config is malformed for " + target);
    let block = pbx.slice(begin, end);
    assert(block.includes('"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";'),
      "Apple Distribution Release identity missing from " + target);
    assert(!block.includes("PROVISIONING_PROFILE_SPECIFIER ="),
      "Refusing to overwrite an existing provisioning profile in " + target);
    const anchor = "\t\t\tbuildSettings = {\n";
    assert(block.includes(anchor), target + " build settings missing");
    if (block.includes("CODE_SIGN_STYLE = Automatic;")) {
      block = block.replace("CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = Manual;");
    } else {
      assert(!block.includes("CODE_SIGN_STYLE = Manual;"), target + " is already manually signed");
      block = block.replace(anchor, anchor + "\t\t\t\tCODE_SIGN_STYLE = Manual;\n");
    }
    block = block.replace(anchor, anchor +
      "\t\t\t\tDEVELOPMENT_TEAM = " + teamId + ";\n" +
      "\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = " + quotePbx(profileName) + ";\n");
    pbx = pbx.slice(0, begin) + block + pbx.slice(end);
  }
  assert((pbx.match(/PROVISIONING_PROFILE_SPECIFIER = /g) ?? []).length === 2,
    "Expected exactly two manual provisioning profiles");
  return pbx;
}

export function appStoreExportOptions(teamId, hostName, widgetName) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "Invalid Apple Team ID");
  const xml = (s) => {
    quotePbx(s);
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict>\n' +
    '<key>method</key><string>app-store-connect</string>\n' +
    '<key>destination</key><string>upload</string>\n' +
    '<key>signingStyle</key><string>manual</string>\n' +
    '<key>signingCertificate</key><string>Apple Distribution</string>\n' +
    '<key>teamID</key><string>' + teamId + '</string>\n' +
    '<key>provisioningProfiles</key><dict>\n' +
    '<key>' + APP_BUNDLE_ID + '</key><string>' + xml(hostName) + '</string>\n' +
    '<key>' + WIDGET_BUNDLE_ID + '</key><string>' + xml(widgetName) + '</string>\n' +
    '</dict>\n<key>uploadSymbols</key><true/>\n' +
    '<key>manageAppVersionAndBuildNumber</key><false/>\n</dict></plist>\n';
}
