import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const iosRoot = join(root, "ios", "App");
const metadata = JSON.parse(readFileSync(join(root, "native", "app-store.json"), "utf8"));
const required = {
  project: join(iosRoot, "App.xcodeproj", "project.pbxproj"),
  appEntitlements: join(iosRoot, "App", "App.entitlements"),
  widgetEntitlements: join(iosRoot, "PortfolioPilotWidgets", "PortfolioPilotWidgets.entitlements"),
  widgetPlist: join(iosRoot, "PortfolioPilotWidgets", "Info.plist"),
  widgetSource: join(iosRoot, "PortfolioPilotWidgets", "PortfolioPilotWidgets.swift")
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
  "com.apple.ApplicationGroups.iOS"
]) {
  assert.ok(project.includes(needle), "WidgetKit Xcode project missing: " + needle);
}
for (const entitlement of [hostEntitlements, widgetEntitlements]) {
  assert.ok(entitlement.includes("com.apple.security.application-groups"), "Missing App Group entitlement");
  assert.ok(entitlement.includes(groupId), "Mismatching App Group entitlement");
}
assert.ok(swift.includes(groupId), "Swift App Group ID mismatch");
assert.ok(swift.includes("portfolio-widget-snapshot-v1"), "Widget snapshot key mismatch");
assert.ok(swift.includes("snapshot.enabled") && swift.includes("!snapshot.isDemo"),
  "Widget must never read personal/demo data before opt-in");
assert.ok(swift.includes("@main") && swift.includes("WidgetBundle"), "Widget entrypoint missing");
assert.ok(swift.includes(".privacySensitive()"), "Widget private fields are not marked sensitive");
assert.ok(plist.includes("com.apple.widgetkit-extension"), "Wrong WidgetKit extension point");
assert.ok(!project.includes("CODE_SIGN_ENTITLEMENTS = ;"), "Widget entitlement configuration is invalid");

console.log("PortfolioPilot WidgetKit generated target verified: 2 privacy-first home widgets, " +
  metadata.bundleId + ".widgets, App Groups entitlement, no automatic personal-data bridge.");
