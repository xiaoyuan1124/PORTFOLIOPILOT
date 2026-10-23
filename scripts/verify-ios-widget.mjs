import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IOS_DISTRIBUTION_SIGNING_SETTING } from "./ios-signing-policy.mjs";

const root = process.cwd();
const iosRoot = join(root, "ios", "App");
const metadata = JSON.parse(readFileSync(join(root, "native", "app-store.json"), "utf8"));
const required = {
  project: join(iosRoot, "App.xcodeproj", "project.pbxproj"),
  appEntitlements: join(iosRoot, "App", "App.entitlements"),
  widgetEntitlements: join(iosRoot, "PortfolioPilotWidgets", "PortfolioPilotWidgets.entitlements"),
  widgetPlist: join(iosRoot, "PortfolioPilotWidgets", "Info.plist"),
  widgetSource: join(iosRoot, "PortfolioPilotWidgets", "PortfolioPilotWidgets.swift"),
  syncPlugin: join(iosRoot, "App", "PortfolioWidgetSyncPlugin.swift"),
  bridgeController: join(iosRoot, "App", "PortfolioWidgetBridgeViewController.swift"),
  sceneDelegate: join(iosRoot, "App", "SceneDelegate.swift"),
  storyboard: join(iosRoot, "App", "Base.lproj", "Main.storyboard")
};
for (const [name, path] of Object.entries(required)) {
  assert.ok(existsSync(path), "WidgetKit " + name + " is missing: " + path);
}
const project = readFileSync(required.project, "utf8");
const hostEntitlements = readFileSync(required.appEntitlements, "utf8");
const widgetEntitlements = readFileSync(required.widgetEntitlements, "utf8");
const plist = readFileSync(required.widgetPlist, "utf8");
const swift = readFileSync(required.widgetSource, "utf8");
const groupId = "group.com.sy1124.portfoliopilot";

for (const needle of [
  "/* PortfolioPilot WidgetKit V1 generated target */",
  "PortfolioPilotWidgets.appex",
  "com.apple.product-type.app-extension",
  "Embed App Extensions",
  "dstSubfolderSpec = 13;",
  "PortfolioPilotWidgets/PortfolioPilotWidgets.entitlements;",
  "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
  "PRODUCT_BUNDLE_IDENTIFIER = " + metadata.bundleId + ".widgets;",
  "IPHONEOS_DEPLOYMENT_TARGET = 17.0;",
  "com.apple.ApplicationGroups.iOS",
  "PortfolioWidgetSyncPlugin.swift in Sources",
  "PortfolioWidgetBridgeViewController.swift in Sources"
]) {
  assert.ok(project.includes(needle), "WidgetKit Xcode project missing: " + needle);
}
// The host and WidgetKit Release configs opt in independently. No global
// identity must accidentally impose distribution signing on SwiftPM targets.
assert.equal(project.split(IOS_DISTRIBUTION_SIGNING_SETTING).length - 1, 2,
  "App and WidgetKit Release each require a target-scoped Apple Distribution signing identity");
for (const entitlement of [hostEntitlements, widgetEntitlements]) {
  assert.ok(entitlement.includes("com.apple.security.application-groups"), "Missing App Group entitlement");
  assert.ok(entitlement.includes(groupId), "Mismatching App Group entitlement");
}
assert.ok(swift.includes(groupId), "Swift App Group ID mismatch");
assert.ok(swift.includes("portfolio-widget-snapshot-v1"), "Widget snapshot key mismatch");
assert.ok(swift.includes("snapshot.enabled") && swift.includes("!snapshot.isDemo"),
  "Widget must never read personal/demo data before opt-in");
assert.ok(swift.includes('defaults.bool(forKey: consentKey)'), "Widget must check current native consent on every load");
const plugin = readFileSync(required.syncPlugin, "utf8");
assert.ok(plugin.includes('defaults.bool(forKey: enabledKey)'), "Native writer must check opt-in before writes");
assert.ok(plugin.includes('defaults.set(false, forKey: enabledKey)') &&
  plugin.includes('defaults.removeObject(forKey: snapshotKey)'), "Native revoke must clear shared data");
assert.ok(plugin.includes("WidgetCenter.shared.reloadTimelines"), "Native updates must refresh the widgets");
assert.ok(readFileSync(required.bridgeController, "utf8").includes("registerPluginInstance(PortfolioWidgetSyncPlugin())"), "Native plugin registration missing");
assert.ok(readFileSync(required.sceneDelegate, "utf8").includes("PortfolioWidgetBridgeViewController()"), "SceneDelegate does not load widget bridge");
assert.ok(readFileSync(required.storyboard, "utf8").includes('customClass="PortfolioWidgetBridgeViewController"'), "Storyboard does not load widget bridge");
assert.ok(swift.includes("@main") && swift.includes("WidgetBundle"), "Widget entrypoint missing");
assert.ok(swift.includes(".privacySensitive()"), "Widget private fields are not marked sensitive");
assert.ok(plist.includes("com.apple.widgetkit-extension"), "Wrong WidgetKit extension point");
assert.ok(!project.includes("CODE_SIGN_ENTITLEMENTS = ;"), "Widget entitlement configuration is invalid");

console.log("PortfolioPilot WidgetKit generated target verified: 2 privacy-first home widgets, " +
  metadata.bundleId + ".widgets, App Groups entitlement, consent-gated native writer enabled.");
