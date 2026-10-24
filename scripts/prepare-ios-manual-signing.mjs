import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import {
  APP_BUNDLE_ID, WIDGET_BUNDLE_ID, assertAppStoreProfile
} from "./ios-manual-signing-contract.mjs";

const required = [
  "APPLE_TEAM_ID",
  "IOS_DISTRIBUTION_P12_BASE64",
  "IOS_DISTRIBUTION_P12_PASSWORD",
  "IOS_APP_PROFILE_BASE64",
  "IOS_WIDGET_PROFILE_BASE64",
  "RUNNER_TEMP",
  "GITHUB_ENV"
];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error("Missing signing prerequisite: " + name);
}

const secretDir = join(process.env.RUNNER_TEMP, "portfoliopilot-manual-signing");
const profilesDir = join(homedir(), "Library", "MobileDevice", "Provisioning Profiles");
const keychain = join(secretDir, "distribution.keychain-db");
const p12Path = join(secretDir, "distribution.p12");
const teamId = process.env.APPLE_TEAM_ID;
mkdirSync(secretDir, { recursive: true, mode: 0o700 });
mkdirSync(profilesDir, { recursive: true });
const saved = [];

function checked(executable, args) {
  const result = spawnSync(executable, args, { encoding: "buffer", maxBuffer: 6 * 1024 * 1024 });
  if (result.error) throw new Error(executable + " unavailable for signing");
  if (result.status !== 0) {
    // Signing files, passwords, API keys and decoded profile payloads must
    // never be echoed into public-repository GitHub Actions logs.
    throw new Error(executable + " failed while preparing App Store signing assets (exit " + result.status + ")");
  }
  return result.stdout;
}
function decodeSecret(name, dest) {
  const input = process.env[name].replace(/\s/g, "");
  if (!input || input.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    throw new Error(name + " is not valid Base64");
  }
  const bytes = Buffer.from(input, "base64");
  if (bytes.length < 300) throw new Error(name + " has an unexpectedly short decoded file");
  writeFileSync(dest, bytes, { mode: 0o600 });
}
function parseProfile(name, label, bundleId) {
  const file = join(secretDir, label + ".mobileprovision");
  const plist = join(secretDir, label + ".plist");
  decodeSecret(name, file);
  writeFileSync(plist, checked("security", ["cms", "-D", "-i", file]), { mode: 0o600 });
  const profile = JSON.parse(checked("plutil", ["-convert", "json", "-o", "-", plist]).toString("utf8"));
  const { name: profileName, uuid } = assertAppStoreProfile(profile, teamId, bundleId);
  const installed = join(profilesDir, uuid + ".mobileprovision");
  if (existsSync(installed)) throw new Error("A provisioning profile UUID is already installed on the runner");
  copyFileSync(file, installed);
  saved.push(installed);
  return profileName;
}

const keychainPassword = randomBytes(24).toString("hex");
try {
  decodeSecret("IOS_DISTRIBUTION_P12_BASE64", p12Path);
  const hostProfile = parseProfile("IOS_APP_PROFILE_BASE64", "app", APP_BUNDLE_ID);
  const widgetProfile = parseProfile("IOS_WIDGET_PROFILE_BASE64", "widget", WIDGET_BUNDLE_ID);
  if (hostProfile === widgetProfile) {
    throw new Error("App and WidgetKit must not share the same provisioning profile name");
  }
  checked("security", ["create-keychain", "-p", keychainPassword, keychain]);
  checked("security", ["unlock-keychain", "-p", keychainPassword, keychain]);
  checked("security", ["set-keychain-settings", "-lut", "21600", keychain]);
  checked("security", [
    "import", p12Path, "-k", keychain, "-P", process.env.IOS_DISTRIBUTION_P12_PASSWORD,
    "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"
  ]);
  checked("security", ["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychain]);
  const identities = checked("security", ["find-identity", "-v", "-p", "codesigning", keychain]).toString("utf8");
  if (!identities.includes("Apple Distribution:")) {
    throw new Error("The .p12 does not include an Apple Distribution certificate and matching private key");
  }
  checked("security", ["list-keychains", "-d", "user", "-s", keychain]);
  checked("security", ["default-keychain", "-d", "user", "-s", keychain]);
  writeFileSync(join(secretDir, "installed-profiles.json"), JSON.stringify(saved), { mode: 0o600 });
  appendFileSync(process.env.GITHUB_ENV,
    "IOS_HOST_PROFILE_NAME=" + hostProfile + "\n" +
    "IOS_WIDGET_PROFILE_NAME=" + widgetProfile + "\n", "utf8");
  console.log("PASS: App Store distribution identity imported and both non-development profiles match Team ID, explicit App IDs, App Groups and expiry.");
} catch (error) {
  writeFileSync(join(secretDir, "installed-profiles.json"), JSON.stringify(saved), { mode: 0o600 });
  throw error;
}
