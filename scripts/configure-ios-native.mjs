import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const templatePath = join(root, "native", "ios", "PrivacyInfo.xcprivacy");
const metadataPath = join(root, "native", "app-store.json");
const iosProjectRoot = join(root, "ios", "App");
const targetPath = join(iosProjectRoot, "App", "PrivacyInfo.xcprivacy");
const infoPlistPath = join(iosProjectRoot, "App", "Info.plist");
const projectPath = join(iosProjectRoot, "App.xcodeproj", "project.pbxproj");

for (const [label, path] of [
  ["PrivacyInfo template", templatePath],
  ["App Store metadata", metadataPath],
  ["generated iOS project", projectPath],
  ["generated Info.plist", infoPlistPath]
]) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
for (const key of ["appName", "bundleId", "version", "buildNumber"]) {
  if (typeof metadata[key] !== "string" || !metadata[key].trim()) {
    throw new Error(`native/app-store.json is missing ${key}.`);
  }
}

if (!/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error("App Store version must be three period-separated integers.");
}
if (!/^\d+(?:\.\d+){0,2}$/.test(metadata.buildNumber)) {
  throw new Error("App Store build number must contain one to three integer components.");
}

copyFileSync(templatePath, targetPath);

let infoPlist = readFileSync(infoPlistPath, "utf8");
infoPlist = infoPlist.replace(
  /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${metadata.appName}$2`
);
writeFileSync(infoPlistPath, infoPlist);

let project = readFileSync(projectPath, "utf8");
if (!project.includes("PrivacyInfo.xcprivacy")) {
  const fileRefId = "F0A1B2C3D4E5F60718293A4B";
  const buildFileId = "F0A1B2C3D4E5F60718293A4C";

  const buildSection = "/* Begin PBXBuildFile section */\n";
  const fileRefSection = "/* Begin PBXFileReference section */\n";
  if (!project.includes(buildSection) || !project.includes(fileRefSection)) {
    throw new Error("Unexpected Xcode project format while adding PrivacyInfo.xcprivacy.");
  }

  project = project.replace(
    buildSection,
    `${buildSection}\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* PrivacyInfo.xcprivacy */; };\n`
  );
  project = project.replace(
    fileRefSection,
    `${fileRefSection}\t\t${fileRefId} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`
  );

  const appGroup = /(\n\t\t[0-9A-F]+ \/\* App \*\/ = \{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = \(\n)/;
  if (!appGroup.test(project)) {
    throw new Error("Could not locate the Xcode App group.");
  }
  project = project.replace(
    appGroup,
    `$1\t\t\t\t${fileRefId} /* PrivacyInfo.xcprivacy */,\n`
  );

  const resources = /(\/\* Begin PBXResourcesBuildPhase section \*\/[\s\S]*?files = \(\n)/;
  if (!resources.test(project)) {
    throw new Error("Could not locate the Xcode resources build phase.");
  }
  project = project.replace(
    resources,
    `$1\t\t\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */,\n`
  );
}

project = project
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${metadata.version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${metadata.buildNumber};`)
  .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${metadata.bundleId};`);

writeFileSync(projectPath, project);

console.log(
  `Configured iOS packaging: ${metadata.appName} ${metadata.version} (${metadata.buildNumber}) ${metadata.bundleId}.`
);
