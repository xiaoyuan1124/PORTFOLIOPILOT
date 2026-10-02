import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const required = [
  "APPLE_TEAM_ID",
  "APP_STORE_CONNECT_KEY_ID",
  "APP_STORE_CONNECT_ISSUER_ID",
  "APP_STORE_CONNECT_KEY_PATH"
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required for signed archive creation.`);
  }
}

const archivePath = resolve(
  process.env.ARCHIVE_PATH || "build/PortfolioPilot-signed.xcarchive"
);
mkdirSync(dirname(archivePath), { recursive: true });

const args = [
  "-project", "ios/App/App.xcodeproj",
  "-scheme", "App",
  "-configuration", "Release",
  "-destination", "generic/platform=iOS",
  "-archivePath", archivePath,
  "-allowProvisioningUpdates",
  "-authenticationKeyPath", resolve(process.env.APP_STORE_CONNECT_KEY_PATH),
  "-authenticationKeyID", process.env.APP_STORE_CONNECT_KEY_ID,
  "-authenticationKeyIssuerID", process.env.APP_STORE_CONNECT_ISSUER_ID,
  `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`,
  "CODE_SIGN_STYLE=Automatic",
  "archive"
];

const result = spawnSync("xcodebuild", args, {
  stdio: "inherit",
  env: process.env
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Signed iOS archive created at ${archivePath}`);
