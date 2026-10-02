import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const templatePath = join(root, "native", "ios", "PrivacyInfo.xcprivacy");
const iosProjectRoot = join(root, "ios", "App");
const targetPath = join(iosProjectRoot, "App", "PrivacyInfo.xcprivacy");
const projectPath = join(iosProjectRoot, "App.xcodeproj", "project.pbxproj");

if (!existsSync(templatePath)) {
  throw new Error("Missing native/ios/PrivacyInfo.xcprivacy template.");
}
if (!existsSync(projectPath)) {
  throw new Error("Missing generated iOS project. Run capacitor add ios first.");
}

copyFileSync(templatePath, targetPath);

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

  writeFileSync(projectPath, project);
}

console.log("Configured iOS PrivacyInfo.xcprivacy for PortfolioPilot.");
