import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const APP_BUNDLE_ID = "com.sy1124.portfoliopilot";
export const WIDGET_BUNDLE_ID = APP_BUNDLE_ID + ".widgets";
export const APP_GROUP_ID = "group.com.sy1124.portfoliopilot";
export const HOST_RELEASE_ID = "504EC3181FED79650016851F";
export const WIDGET_RELEASE_ID = "F0B10000000000000000000E";

function checkedIdentity(identity) {
  assert(typeof identity === "string" && /^[A-Fa-f0-9]{40}$/.test(identity),
    "Expected the exact validated Distribution certificate SHA-1 identity");
  return identity.toUpperCase();
}

// Input must come from `security find-identity -v -p codesigning` on the
// temporary imported keychain. Only trusted, valid certificate/private-key
// pairs appear there. Never accept development or arbitrary named identities.
export function selectDistributionIdentity(listing, teamId) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "Invalid Apple Team ID");
  assert(typeof listing === "string", "Missing trusted signing identity listing");
  const matches = [...listing.matchAll(
    /^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"(?:Apple Distribution|iPhone Distribution): [^"\r\n]+ \(([A-Z0-9]{10})\)"[ \t]*$/gm
  )].filter(match => match[2] === teamId);
  assert(matches.length === 1, "Expected exactly one valid Distribution private-key identity for the configured Team");
  return checkedIdentity(matches[0][1]);
}

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

// Detect the common case where a valid Apple Distribution .p12 and valid
// App Store profiles came from different signing identities. Xcode otherwise
// fails late with an unhelpful "no matching provisioning profile" error.
// Never print any certificate DER bytes or their fingerprints to CI logs.
function certificateDigest(data) {
  assert(typeof data === "string" && data.length > 100 &&
    /^[A-Za-z0-9+/=\s]+$/.test(data), "Malformed developer certificate data");
  const der = Buffer.from(data.replace(/\s/g, ""), "base64");
  assert(der.length > 100 && der[0] === 0x30,
    "Malformed DER certificate in signing material");
  return createHash("sha256").update(der).digest("hex");
}

export function assertDistributionCertificateMatchesProfiles(pemCertificates, hostCertificates, widgetCertificates, selectedIdentity) {
  assert(typeof pemCertificates === "string", "Keychain certificate PEM missing");
  if (selectedIdentity !== undefined) selectedIdentity = checkedIdentity(selectedIdentity);
  const keychainHashes = new Set();
  for (const match of pemCertificates.matchAll(/-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END CERTIFICATE-----/g)) {
    if (selectedIdentity !== undefined) {
      const der = Buffer.from(match[1].replace(/\s/g, ""), "base64");
      if (createHash("sha1").update(der).digest("hex").toUpperCase() !== selectedIdentity) continue;
    }
    keychainHashes.add(certificateDigest(match[1]));
  }
  assert(keychainHashes.size > 0, "No certificate could be read from the Apple Distribution keychain");
  for (const [label, certificates] of [
    ["main App", hostCertificates],
    ["WidgetKit extension", widgetCertificates]
  ]) {
    assert(Array.isArray(certificates) && certificates.length > 0,
      label + " provisioning profile has no signing certificates");
    const matches = certificates.some((der) => keychainHashes.has(certificateDigest(der)));
    assert(matches, label + " App Store profile was created for a different distribution certificate");
  }
}

function quotePbx(s) {
  assert(typeof s === "string" && s.length > 0 && s.length < 160 &&
    !/[\u0000-\u001f]/.test(s), "Invalid Xcode provisioning profile name");
  return JSON.stringify(s);
}

export function setManualReleaseSigning(pbx, teamId, hostName, widgetName, selectedIdentity) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "Invalid Apple Team ID");
  if (selectedIdentity !== undefined) selectedIdentity = checkedIdentity(selectedIdentity);
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
    if (selectedIdentity !== undefined) {
      block = block.replace('"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";',
        '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "' + selectedIdentity + '";');
    }
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
  // Xcode's TargetAttributes ProvisioningStyle must agree with the Release
  // build settings. Leaving it on Automatic can still trigger the very
  // "conflicting provisioning settings" error encountered in upload #3.
  for (const [target, id] of [
    ["App", "504EC3031FED79650016851F"],
    ["WidgetKit", "F0B100000000000000000006"]
  ]) {
    const head = "\t\t\t\t\t" + id + " = {\n";
    const start = pbx.indexOf(head);
    assert(start !== -1 && pbx.indexOf(head, start + head.length) === -1,
      "Missing " + target + " TargetAttributes");
    const end = pbx.indexOf("\t\t\t\t\t};\n", start);
    assert(end !== -1, "Malformed " + target + " TargetAttributes");
    const block = pbx.slice(start, end);
    assert(block.includes("ProvisioningStyle = Automatic;"),
      "Expected automatic " + target + " signing before manual conversion");
    pbx = pbx.slice(0, start) +
      block.replace("ProvisioningStyle = Automatic;", "ProvisioningStyle = Manual;") +
      pbx.slice(end);
  }
  assert((pbx.match(/PROVISIONING_PROFILE_SPECIFIER = /g) ?? []).length === 2,
    "Expected exactly two manual provisioning profiles");
  return pbx;
}

export function appStoreExportOptions(teamId, hostName, widgetName, selectedIdentity) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "Invalid Apple Team ID");
  const signingIdentity = selectedIdentity === undefined ? "Apple Distribution" : checkedIdentity(selectedIdentity);
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
    '<key>signingCertificate</key><string>' + signingIdentity + '</string>\n' +
    '<key>teamID</key><string>' + teamId + '</string>\n' +
    '<key>provisioningProfiles</key><dict>\n' +
    '<key>' + APP_BUNDLE_ID + '</key><string>' + xml(hostName) + '</string>\n' +
    '<key>' + WIDGET_BUNDLE_ID + '</key><string>' + xml(widgetName) + '</string>\n' +
    '</dict>\n<key>uploadSymbols</key><true/>\n' +
    '<key>manageAppVersionAndBuildNumber</key><false/>\n</dict></plist>\n';
}
