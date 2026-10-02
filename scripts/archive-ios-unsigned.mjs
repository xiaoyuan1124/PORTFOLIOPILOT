import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const archivePath = resolve(
  process.env.ARCHIVE_PATH || "build/PortfolioPilot.xcarchive"
);
mkdirSync(dirname(archivePath), { recursive: true });

const args = [
  "-project", "ios/App/App.xcodeproj",
  "-scheme", "App",
  "-configuration", "Release",
  "-destination", "generic/platform=iOS",
  "-archivePath", archivePath,
  "CODE_SIGNING_ALLOWED=NO",
  "archive"
];

const result = spawnSync("xcodebuild", args, {
  stdio: "inherit",
  env: process.env
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Unsigned iOS archive created at ${archivePath}`);
