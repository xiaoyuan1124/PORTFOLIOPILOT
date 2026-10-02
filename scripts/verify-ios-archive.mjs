import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const archivePath = resolve(
  process.env.ARCHIVE_PATH || "build/PortfolioPilot.xcarchive"
);
const metadata = JSON.parse(
  readFileSync(resolve("native/app-store.json"), "utf8")
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function plistValue(path, key) {
  const result = spawnSync(
    "plutil",
    ["-extract", key, "raw", "-o", "-", path],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `Unable to read ${key} from ${path}: ${result.stderr || result.stdout}`
    );
  }
  return result.stdout.trim();
}

const archiveInfo = join(archivePath, "Info.plist");
const applicationsDir = join(archivePath, "Products", "Applications");

assert(existsSync(archiveInfo), "Archive Info.plist is missing.");
assert(existsSync(applicationsDir), "Archive Products/Applications is missing.");

const appBundles = readdirSync(applicationsDir).filter((name) => name.endsWith(".app"));
assert(appBundles.length === 1, `Expected exactly one .app in archive, found ${appBundles.length}.`);

const appPath = join(applicationsDir, appBundles[0]);
const appInfo = join(appPath, "Info.plist");
assert(existsSync(appInfo), "Archived app Info.plist is missing.");

const checks = {
  CFBundleIdentifier: metadata.bundleId,
  CFBundleDisplayName: metadata.appName,
  CFBundleShortVersionString: metadata.version,
  CFBundleVersion: metadata.buildNumber
};

for (const [key, expected] of Object.entries(checks)) {
  const actual = plistValue(appInfo, key);
  assert(actual === expected, `${key} mismatch: expected ${expected}, got ${actual}.`);
}

const archiveApplicationPath = plistValue(
  archiveInfo,
  "ApplicationProperties.ApplicationPath"
);
assert(
  archiveApplicationPath.endsWith(`/${appBundles[0]}`) ||
    archiveApplicationPath === `Applications/${appBundles[0]}`,
  `Unexpected archive ApplicationPath: ${archiveApplicationPath}`
);

const signingIdentityResult = spawnSync(
  "codesign",
  ["-dv", "--verbose=4", appPath],
  { encoding: "utf8" }
);
const signingOutput = `${signingIdentityResult.stdout || ""}${signingIdentityResult.stderr || ""}`;
assert(
  signingIdentityResult.status !== 0 || !/Authority=Apple Distribution/.test(signingOutput),
  "Unsigned RC archive unexpectedly contains an Apple Distribution signature."
);

console.log(
  `Unsigned RC archive verified: ${metadata.appName} ${metadata.version} (${metadata.buildNumber}) ${metadata.bundleId}`
);
