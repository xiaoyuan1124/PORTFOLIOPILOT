import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const required = [
  "APP_STORE_CONNECT_KEY_ID",
  "APP_STORE_CONNECT_ISSUER_ID",
  "APP_STORE_CONNECT_KEY_PATH",
  "EXPORT_OPTIONS_PATH"
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required for TestFlight upload.`);
  }
}

const archivePath = resolve(
  process.env.ARCHIVE_PATH || "build/PortfolioPilot-signed.xcarchive"
);
const exportOptionsPath = resolve(process.env.EXPORT_OPTIONS_PATH);

if (!existsSync(archivePath)) {
  throw new Error(`Signed archive not found: ${archivePath}`);
}
if (!existsSync(exportOptionsPath)) {
  throw new Error(`Export options not found: ${exportOptionsPath}`);
}

const exportPath = resolve(process.env.EXPORT_PATH || "build/testflight-export");

const args = [
  "-exportArchive",
  "-archivePath", archivePath,
  "-exportPath", exportPath,
  "-exportOptionsPlist", exportOptionsPath,
  "-allowProvisioningUpdates",
  "-authenticationKeyPath", resolve(process.env.APP_STORE_CONNECT_KEY_PATH),
  "-authenticationKeyID", process.env.APP_STORE_CONNECT_KEY_ID,
  "-authenticationKeyIssuerID", process.env.APP_STORE_CONNECT_ISSUER_ID
];

const result = spawnSync("xcodebuild", args, {
  stdio: "inherit",
  env: process.env
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log("Xcode export/upload completed. Check App Store Connect processing status for the uploaded build.");
