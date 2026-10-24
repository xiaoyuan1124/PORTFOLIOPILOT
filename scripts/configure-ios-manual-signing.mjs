import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setManualReleaseSigning } from "./ios-manual-signing-contract.mjs";

const required = ["APPLE_TEAM_ID", "IOS_HOST_PROFILE_NAME", "IOS_WIDGET_PROFILE_NAME", "IOS_DISTRIBUTION_IDENTITY_SHA1"];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error("Missing manual App Store signing input: " + name);
}
const projectPath = join(process.cwd(), "ios", "App", "App.xcodeproj", "project.pbxproj");
const original = readFileSync(projectPath, "utf8");
const patched = setManualReleaseSigning(original,
  process.env.APPLE_TEAM_ID, process.env.IOS_HOST_PROFILE_NAME, process.env.IOS_WIDGET_PROFILE_NAME,
  process.env.IOS_DISTRIBUTION_IDENTITY_SHA1);
writeFileSync(projectPath, patched);
console.log("PASS: independent manual App Store signing configured on App and WidgetKit Release targets (SwiftPM unaffected).");
