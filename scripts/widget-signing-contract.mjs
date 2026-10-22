import assert from "node:assert/strict";

export const WIDGET_GROUP_ID = "group.com.sy1124.portfoliopilot";
export const WIDGET_BUNDLE_SUFFIX = ".widgets";

function verifyEntitlementPair(label, bundleId, signature, profile, groupId, teamId, now) {
  assert(signature && typeof signature === "object", label + ": missing signed entitlements");
  assert(profile && typeof profile === "object", label + ": missing provisioning profile");
  const wantedId = teamId + "." + bundleId;
  assert.equal(signature["application-identifier"], wantedId,
    label + ": signed App ID mismatch");
  assert.equal(signature["com.apple.developer.team-identifier"], teamId,
    label + ": signed Team ID mismatch");
  assert.notEqual(signature["get-task-allow"], true,
    label + ": debug/development signing is not acceptable for TestFlight");

  const signedGroups = signature["com.apple.security.application-groups"];
  assert(Array.isArray(signedGroups) && signedGroups.includes(groupId),
    label + ": signed App Groups entitlement is absent");
  const allowed = profile.Entitlements;
  assert(allowed && typeof allowed === "object", label + ": provisioning profile has no entitlements");
  assert.equal(allowed["application-identifier"], wantedId,
    label + ": provisioning profile belongs to another App ID");
  const allowedGroups = allowed["com.apple.security.application-groups"];
  assert(Array.isArray(allowedGroups) && allowedGroups.includes(groupId),
    label + ": App Group missing from the provisioning profile; register and assign it in Apple Developer");

  assert(Array.isArray(profile.TeamIdentifier) && profile.TeamIdentifier.includes(teamId),
    label + ": provisioning Team ID mismatch");
  const expiry = Date.parse(profile.ExpirationDate);
  assert(Number.isFinite(expiry) && expiry > now.getTime(),
    label + ": provisioning profile expired or expiry is invalid");
}

export function assertSignedWidgetContract({
  hostInfo, widgetInfo, hostEntitlements, widgetEntitlements,
  hostProfile, widgetProfile, metadata, teamId, now = new Date()
}) {
  assert(/^[A-Z0-9]{10}$/.test(teamId), "APPLE_TEAM_ID is absent or malformed");
  assert.equal(metadata.bundleId, "com.sy1124.portfoliopilot", "Unexpected release bundle ID");
  assert.equal(hostInfo.CFBundleIdentifier, metadata.bundleId, "Host bundle ID mismatch");
  assert.equal(widgetInfo.CFBundleIdentifier, metadata.bundleId + WIDGET_BUNDLE_SUFFIX,
    "Widget bundle ID mismatch");
  assert.equal(hostInfo.CFBundleShortVersionString, metadata.version, "Host version mismatch");
  assert.equal(widgetInfo.CFBundleShortVersionString, metadata.version, "Widget version mismatch");
  assert.equal(String(hostInfo.CFBundleVersion), String(metadata.buildNumber), "Host build number mismatch");
  assert.equal(String(widgetInfo.CFBundleVersion), String(metadata.buildNumber), "Widget build number mismatch");
  assert.equal(widgetInfo.NSExtension?.NSExtensionPointIdentifier, "com.apple.widgetkit-extension",
    "Embedded appex is not a WidgetKit extension");

  verifyEntitlementPair("Host App", metadata.bundleId, hostEntitlements,
    hostProfile, WIDGET_GROUP_ID, teamId, now);
  verifyEntitlementPair("Widget Extension", metadata.bundleId + WIDGET_BUNDLE_SUFFIX,
    widgetEntitlements, widgetProfile, WIDGET_GROUP_ID, teamId, now);
}
