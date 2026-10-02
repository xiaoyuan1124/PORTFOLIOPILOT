import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(readFileSync(join(root, "native", "app-store.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.version === metadata.version, "package.json version must match native/app-store.json version.");

const capacitorConfig = readFileSync(join(root, "capacitor.config.ts"), "utf8");
assert(capacitorConfig.includes(`appId: "${metadata.bundleId}"`), "Capacitor appId does not match App Store metadata.");
assert(capacitorConfig.includes(`appName: "${metadata.appName}"`), "Capacitor appName does not match App Store metadata.");

const iosRoot = join(root, "ios", "App");
const projectPath = join(iosRoot, "App.xcodeproj", "project.pbxproj");
const infoPath = join(iosRoot, "App", "Info.plist");
const privacyPath = join(iosRoot, "App", "PrivacyInfo.xcprivacy");
const appIconContentsPath = join(iosRoot, "App", "Assets.xcassets", "AppIcon.appiconset", "Contents.json");

for (const path of [projectPath, infoPath, privacyPath, appIconContentsPath]) {
  assert(existsSync(path), `Missing required iOS packaging file: ${path}`);
}

const project = readFileSync(projectPath, "utf8");
const info = readFileSync(infoPath, "utf8");
const privacy = readFileSync(privacyPath, "utf8");
const iconContents = JSON.parse(readFileSync(appIconContentsPath, "utf8"));

assert(project.includes(`MARKETING_VERSION = ${metadata.version};`), "Xcode marketing version is not configured.");
assert(project.includes(`CURRENT_PROJECT_VERSION = ${metadata.buildNumber};`), "Xcode build number is not configured.");
assert(project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${metadata.bundleId};`), "Xcode bundle identifier is not configured.");
assert(project.includes("PrivacyInfo.xcprivacy in Resources"), "PrivacyInfo.xcprivacy is not included in Xcode resources.");
assert(
  new RegExp(`<key>CFBundleDisplayName<\\/key>\\s*<string>${metadata.appName}<\\/string>`).test(info),
  "CFBundleDisplayName is not configured."
);
assert(privacy.includes("NSPrivacyAccessedAPICategoryUserDefaults"), "Privacy manifest is missing UserDefaults API category.");
assert(privacy.includes("CA92.1"), "Privacy manifest is missing CA92.1 reason.");

const iconImages = Array.isArray(iconContents.images) ? iconContents.images : [];
const marketingIcon = iconImages.find((image) =>
  image &&
  typeof image === "object" &&
  (image.idiom === "ios-marketing" || image.size === "1024x1024")
);
assert(marketingIcon, "Generated AppIcon does not include an App Store 1024 icon entry.");

if (marketingIcon.filename) {
  assert(
    existsSync(join(iosRoot, "App", "Assets.xcassets", "AppIcon.appiconset", marketingIcon.filename)),
    "Generated App Store icon image file is missing."
  );
}

const privacyHtml = join(root, "out", "privacy", "index.html");
const supportHtml = join(root, "out", "support", "index.html");
assert(existsSync(privacyHtml), "Native static export is missing /privacy.");
assert(existsSync(supportHtml), "Native static export is missing /support.");

for (const [label, url] of [
  ["privacyPolicyUrl", metadata.privacyPolicyUrl],
  ["supportUrl", metadata.supportUrl]
]) {
  assert(typeof url === "string" && /^https:\/\//.test(url), `${label} must be a public HTTPS URL.`);
}

console.log(
  `iOS packaging verified: ${metadata.appName} ${metadata.version} (${metadata.buildNumber}), App Store icon, privacy manifest, privacy/support pages.`
);
