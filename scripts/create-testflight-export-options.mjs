import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { appStoreExportOptions } from "./ios-manual-signing-contract.mjs";

const teamId = process.env.APPLE_TEAM_ID?.trim();
const host = process.env.IOS_HOST_PROFILE_NAME?.trim();
const widget = process.env.IOS_WIDGET_PROFILE_NAME?.trim();
if (!teamId || !host || !widget) {
  throw new Error("Manual App Store export requires Team ID and both profile names.");
}
const output = resolve(process.env.EXPORT_OPTIONS_PATH || "build/ExportOptions-TestFlight.plist");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, appStoreExportOptions(teamId, host, widget), "utf8");
console.log("Created manually signed App Store Connect export options.");
