import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertSignedWidgetContract } from "./widget-signing-contract.mjs";

function checked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: null, maxBuffer: 5 * 1024 * 1024, ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Do not print sensitive provisioning payloads, ASC key material, or raw
    // stdout/stderr into GitHub Actions logs.
    throw new Error(command + " failed during signed WidgetKit verification (" +
      String(result.status) + ").");
  }
  return result.stdout;
}

const archivePath = resolve(process.env.ARCHIVE_PATH || "");
const teamId = process.env.APPLE_TEAM_ID?.trim() ?? "";
if (!process.env.ARCHIVE_PATH || !/^[A-Z0-9]{10}$/.test(teamId)) {
  throw new Error("ARCHIVE_PATH and an Apple Team ID are required for signed WidgetKit verification.");
}
const metadata = JSON.parse(readFileSync(join(process.cwd(), "native", "app-store.json"), "utf8"));
const appsDir = join(archivePath, "Products", "Applications");
const apps = existsSync(appsDir)
  ? readdirSync(appsDir).filter((name) => name.endsWith(".app"))
  : [];
if (apps.length !== 1) throw new Error("Signed archive must contain exactly one .app");
const host = join(appsDir, apps[0]);
const widget = join(host, "PlugIns", "PortfolioPilotWidgets.appex");
if (!existsSync(join(widget, "Info.plist"))) {
  throw new Error("The signed archive does not embed PortfolioPilotWidgets.appex");
}

const temporary = mkdtempSync(join(tmpdir(), "portfoliopilot-widget-signing-"));
function parsePlist(bytes, filename) {
  const file = join(temporary, filename);
  writeFileSync(file, bytes);
  return JSON.parse(checked("plutil", ["-convert", "json", "-o", "-", file]).toString("utf8"));
}
function readSignature(bundle, label) {
  checked("codesign", ["--verify", "--strict", bundle]);
  const plist = checked("codesign", ["--display", "--entitlements", "-", "--xml", bundle]);
  if (!plist.length) throw new Error(label + " has no embedded entitlements");
  return parsePlist(plist, label + "-entitlements.plist");
}
function readProfile(bundle, label) {
  const path = join(bundle, "embedded.mobileprovision");
  if (!existsSync(path)) {
    throw new Error(label + " has no embedded provisioning profile; App Groups cannot be verified");
  }
  return parsePlist(checked("security", ["cms", "-D", "-i", path]), label + "-profile.plist");
}

try {
  // Verify both signed executables, their own entitlement claims AND the
  // matching Apple-issued provisioning profiles before uploading to TestFlight.
  checked("codesign", ["--verify", "--deep", "--strict", host]);
  const hostInfo = parsePlist(readFileSync(join(host, "Info.plist")), "host-info.plist");
  const widgetInfo = parsePlist(readFileSync(join(widget, "Info.plist")), "widget-info.plist");
  assertSignedWidgetContract({
    hostInfo, widgetInfo,
    hostEntitlements: readSignature(host, "host"),
    widgetEntitlements: readSignature(widget, "widget"),
    hostProfile: readProfile(host, "host"),
    widgetProfile: readProfile(widget, "widget"),
    metadata, teamId
  });
  console.log("PASS: signed host + WidgetKit App IDs, App Group entitlements, " +
    "both Apple provisioning profiles, signatures, version/build and expiry verified.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
