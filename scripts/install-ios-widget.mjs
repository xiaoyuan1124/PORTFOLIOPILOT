import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IOS_DISTRIBUTION_SIGNING_SETTING } from './ios-signing-policy.mjs';

// Capacitor 8 SPM generates a fresh Xcode project on every native:ios:add.
// The template's host IDs are pinned and validated below: fail closed if it changes.
const root = process.cwd();
const iosRoot = join(root, 'ios', 'App');
const projectPath = join(iosRoot, 'App.xcodeproj', 'project.pbxproj');
const sourceDir = join(root, 'native', 'ios', 'widget');
const widgetDir = join(iosRoot, 'PortfolioPilotWidgets');
const metadata = JSON.parse(readFileSync(join(root, 'native', 'app-store.json'), 'utf8'));

if (!existsSync(projectPath)) throw new Error('Missing generated Capacitor SPM project; run cap add ios first.');
if (!/^[A-Za-z0-9.-]+$/.test(metadata.bundleId) || !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
  throw new Error('Invalid native App Store metadata.');
}
mkdirSync(widgetDir, { recursive: true });
for (const name of ['PortfolioPilotWidgets.swift', 'Info.plist', 'PortfolioPilotWidgets.entitlements']) {
  copyFileSync(join(sourceDir, name), join(widgetDir, name));
}
copyFileSync(join(root, 'native', 'ios', 'App.entitlements'), join(iosRoot, 'App', 'App.entitlements'));
for (const name of ['PortfolioWidgetSyncPlugin.swift', 'PortfolioWidgetBridgeViewController.swift']) {
  copyFileSync(join(sourceDir, name), join(iosRoot, 'App', name));
}

function patchGeneratedFile(file, original, replacement) {
  const path = join(iosRoot, 'App', file);
  const source = readFileSync(path, 'utf8');
  const count = source.split(original).length - 1;
  if (count !== 1) {
    throw new Error('Capacitor native entrypoint changed (' + file + '): ' + original);
  }
  writeFileSync(path, source.replace(original, replacement));
}

patchGeneratedFile('SceneDelegate.swift',
  'window?.rootViewController = CAPBridgeViewController()',
  'window?.rootViewController = PortfolioWidgetBridgeViewController()');
patchGeneratedFile('Base.lproj/Main.storyboard',
  'customClass="CAPBridgeViewController" customModule="Capacitor"',
  'customClass="PortfolioWidgetBridgeViewController" customModule="App"');

let pbx = readFileSync(projectPath, 'utf8');
const signature = '/* PortfolioPilot WidgetKit V1 generated target */';
if (pbx.includes(signature)) {
  console.log('WidgetKit project target already installed.');
  process.exit(0);
}
const id = (n) => 'F0B10000' + n.toString(16).toUpperCase().padStart(16, '0');
const ids = {
  product: id(1), swift: id(2), plist: id(3), entitlement: id(4),
  group: id(5), target: id(6), sources: id(7), frameworks: id(8),
  resources: id(9), embed: id(10), buildSwift: id(11), buildEmbed: id(12),
  debug: id(13), release: id(14), configList: id(15), proxy: id(16),
  dependency: id(17), bridgeSwift: id(18), pluginSwift: id(19),
  buildBridge: id(20), buildPlugin: id(21)
};
for (const name of Object.values(ids)) {
  if (pbx.includes(name)) throw new Error('Widget PBX ID collision: ' + name);
}
const host = '504EC3031FED79650016851F';
const hostResources = '504EC3021FED79650016851F';
const projectId = '504EC2FC1FED79650016851F';

function replaceOnce(before, after) {
  const count = pbx.split(before).length - 1;
  if (count !== 1) {
    throw new Error('Unexpected Capacitor SPM project (expected 1, found ' + count + '): ' + before.slice(0, 90));
  }
  pbx = pbx.replace(before, after);
}

// Explicit host + project anchors are stable in the official Capacitor 8 SPM template.
replaceOnce('\t\t\t\t504EC3061FED79650016851F /* App */,\n',
  '\t\t\t\t504EC3061FED79650016851F /* App */,\n\t\t\t\t' + ids.group + ' /* PortfolioPilotWidgets */,\n');
replaceOnce('\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n',
  '\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n' +
  '\t\t\t\t' + ids.bridgeSwift + ' /* PortfolioWidgetBridgeViewController.swift */,\n' +
  '\t\t\t\t' + ids.pluginSwift + ' /* PortfolioWidgetSyncPlugin.swift */,\n');
replaceOnce('\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n',
  '\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n' +
  '\t\t\t\t' + ids.buildBridge + ' /* PortfolioWidgetBridgeViewController.swift in Sources */,\n' +
  '\t\t\t\t' + ids.buildPlugin + ' /* PortfolioWidgetSyncPlugin.swift in Sources */,\n');
replaceOnce('\t\t\t\t504EC3041FED79650016851F /* App.app */,\n',
  '\t\t\t\t504EC3041FED79650016851F /* App.app */,\n\t\t\t\t' + ids.product + ' /* PortfolioPilotWidgets.appex */,\n');
replaceOnce('\t\t\t\t' + hostResources + ' /* Resources */,\n',
  '\t\t\t\t' + hostResources + ' /* Resources */,\n\t\t\t\t' + ids.embed + ' /* Embed App Extensions */,\n');
const hostMarker = '\t\t' + host + ' /* App */ = {';
const hostStart = pbx.indexOf(hostMarker);
const hostEnd = pbx.indexOf('\n\t\t};', hostStart);
if (hostStart < 0 || hostEnd < 0) throw new Error('Cannot locate App target.');
let hostBlock = pbx.slice(hostStart, hostEnd);
if (!hostBlock.includes('\t\t\tdependencies = (\n\t\t\t);')) throw new Error('Unexpected App dependencies block.');
hostBlock = hostBlock.replace('\t\t\tdependencies = (\n\t\t\t);',
  '\t\t\tdependencies = (\n\t\t\t\t' + ids.dependency + ' /* WidgetKit dependency */,\n\t\t\t);');
pbx = pbx.slice(0, hostStart) + hostBlock + pbx.slice(hostEnd);

replaceOnce('\t\t\ttargets = (\n\t\t\t\t' + host + ' /* App */,\n',
  '\t\t\ttargets = (\n\t\t\t\t' + host + ' /* App */,\n\t\t\t\t' + ids.target + ' /* PortfolioPilotWidgets */,\n');
// Existing host has a target attributes map; extend it rather than changing
// provisioning defaults for the host or existing Capacitor Swift packages.
const attrStart = '\t\t\t\t\t' + host + ' = {\n';
const attrPos = pbx.indexOf(attrStart);
const attrEnd = pbx.indexOf('\t\t\t\t\t};\n', attrPos);
if (attrPos < 0 || attrEnd < 0) throw new Error('Cannot locate App target attributes.');
let attrBlock = pbx.slice(attrPos, attrEnd);
if (!attrBlock.includes('\t\t\t\t\t\tProvisioningStyle = Automatic;\n')) {
  throw new Error('Capacitor target provisioning attributes changed.');
}
attrBlock = attrBlock.replace('\t\t\t\t\t\tProvisioningStyle = Automatic;\n',
  '\t\t\t\t\t\tProvisioningStyle = Automatic;\n' +
  '\t\t\t\t\t\tSystemCapabilities = { com.apple.ApplicationGroups.iOS = { enabled = 1; }; };\n');
pbx = pbx.slice(0, attrPos) + attrBlock + pbx.slice(attrEnd);
replaceOnce('\t\t\t\t\t};\n\t\t\t\t};\n\t\t\t};\n\t\t\tbuildConfigurationList =',
  '\t\t\t\t\t};\n' +
  '\t\t\t\t\t' + ids.target + ' = {\n' +
  '\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;\n' +
  '\t\t\t\t\t\tProvisioningStyle = Automatic;\n' +
  '\t\t\t\t\t\tSystemCapabilities = { com.apple.ApplicationGroups.iOS = { enabled = 1; }; };\n' +
  '\t\t\t\t\t};\n\t\t\t\t};\n\t\t\t};\n\t\t\tbuildConfigurationList =');

for (const config of ['504EC3171FED79650016851F', '504EC3181FED79650016851F']) {
  const m = '\t\t' + config + ' /* ' + (config === '504EC3171FED79650016851F' ? 'Debug' : 'Release') + ' */ = {';
  const start = pbx.indexOf(m);
  const settingsStart = pbx.indexOf('\t\t\tbuildSettings = {\n', start);
  const end = pbx.indexOf('\n\t\t};', start);
  if (start < 0 || settingsStart < start || end < settingsStart) throw new Error('Cannot find App build configuration ' + config);
  if (pbx.slice(settingsStart, end).includes('CODE_SIGN_ENTITLEMENTS')) throw new Error('Host App entitlement setting already exists.');
  // Limit Apple Distribution signing to the main App Release target.
  // Never override the signing identity of Capacitor / SPM package targets.
  const releaseDistribution = config === '504EC3181FED79650016851F'
    ? '\t\t\t\t' + IOS_DISTRIBUTION_SIGNING_SETTING + '\n'
    : '';
  pbx = pbx.slice(0, settingsStart) +
    '\t\t\tbuildSettings = {\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n' +
    releaseDistribution +
    pbx.slice(settingsStart + '\t\t\tbuildSettings = {\n'.length);
}

const obj = (key, comment, lines) =>
  '\t\t' + ids[key] + ' /* ' + comment + ' */ = {\n' +
  lines.map((l) => '\t\t\t' + l).join('\n') + '\n\t\t};\n';
const buildConfig = (key, mode) => obj(key, mode, [
  'isa = XCBuildConfiguration;',
  'buildSettings = {',
  '\tAPPLICATION_EXTENSION_API_ONLY = YES;',
  ...(mode === 'Release' ? ['\t' + IOS_DISTRIBUTION_SIGNING_SETTING] : []),
  '\tCODE_SIGN_ENTITLEMENTS = PortfolioPilotWidgets/PortfolioPilotWidgets.entitlements;',
  '\tCODE_SIGN_STYLE = Automatic;',
  '\tCURRENT_PROJECT_VERSION = ' + metadata.buildNumber + ';',
  '\tGENERATE_INFOPLIST_FILE = NO;',
  '\tINFOPLIST_FILE = PortfolioPilotWidgets/Info.plist;',
  '\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;',
  '\tLD_RUNPATH_SEARCH_PATHS = ( "$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks" );',
  '\tMARKETING_VERSION = ' + metadata.version + ';',
  '\tPRODUCT_BUNDLE_IDENTIFIER = ' + metadata.bundleId + '.widgets;',
  '\tPRODUCT_NAME = "$(TARGET_NAME)";',
  '\tSKIP_INSTALL = YES;',
  '\tSWIFT_VERSION = 5.0;',
  '\tTARGETED_DEVICE_FAMILY = "1,2";',
  '\t' + (mode === 'Debug' ? 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;' : 'SWIFT_OPTIMIZATION_LEVEL = "-O";'),
  '};', 'name = ' + mode + ';'
]);

const entries = [
  obj('buildBridge', 'PortfolioWidgetBridgeViewController.swift in Sources', [
    'isa = PBXBuildFile;', 'fileRef = ' + ids.bridgeSwift + ' /* PortfolioWidgetBridgeViewController.swift */;']),
  obj('buildPlugin', 'PortfolioWidgetSyncPlugin.swift in Sources', [
    'isa = PBXBuildFile;', 'fileRef = ' + ids.pluginSwift + ' /* PortfolioWidgetSyncPlugin.swift */;']),
  obj('bridgeSwift', 'PortfolioWidgetBridgeViewController.swift', [
    'isa = PBXFileReference;', 'lastKnownFileType = sourcecode.swift;',
    'path = PortfolioWidgetBridgeViewController.swift;', 'sourceTree = "<group>";']),
  obj('pluginSwift', 'PortfolioWidgetSyncPlugin.swift', [
    'isa = PBXFileReference;', 'lastKnownFileType = sourcecode.swift;',
    'path = PortfolioWidgetSyncPlugin.swift;', 'sourceTree = "<group>";']),
  obj('buildSwift', 'PortfolioPilotWidgets.swift in Sources', [
    'isa = PBXBuildFile;', 'fileRef = ' + ids.swift + ' /* PortfolioPilotWidgets.swift */;']),
  obj('buildEmbed', 'PortfolioPilotWidgets.appex in Embed App Extensions', [
    'isa = PBXBuildFile;', 'fileRef = ' + ids.product + ' /* PortfolioPilotWidgets.appex */;',
    'settings = { ATTRIBUTES = (RemoveHeadersOnCopy, ); };']),
  obj('swift', 'PortfolioPilotWidgets.swift', [
    'isa = PBXFileReference;', 'lastKnownFileType = sourcecode.swift;',
    'path = PortfolioPilotWidgets.swift;', 'sourceTree = "<group>";']),
  obj('plist', 'Info.plist', [
    'isa = PBXFileReference;', 'lastKnownFileType = text.plist.xml;',
    'path = Info.plist;', 'sourceTree = "<group>";']),
  obj('entitlement', 'PortfolioPilotWidgets.entitlements', [
    'isa = PBXFileReference;', 'lastKnownFileType = text.plist.xml;',
    'path = PortfolioPilotWidgets.entitlements;', 'sourceTree = "<group>";']),
  obj('product', 'PortfolioPilotWidgets.appex', [
    'isa = PBXFileReference;', 'explicitFileType = "wrapper.app-extension";',
    'includeInIndex = 0;', 'path = PortfolioPilotWidgets.appex;', 'sourceTree = BUILT_PRODUCTS_DIR;']),
  obj('group', 'PortfolioPilotWidgets', [
    'isa = PBXGroup;', 'children = (',
    '\t' + ids.swift + ' /* PortfolioPilotWidgets.swift */,',
    '\t' + ids.plist + ' /* Info.plist */,',
    '\t' + ids.entitlement + ' /* PortfolioPilotWidgets.entitlements */,',
    ');', 'path = PortfolioPilotWidgets;', 'sourceTree = "<group>";']),
  obj('sources', 'Widget Sources', [
    'isa = PBXSourcesBuildPhase;', 'buildActionMask = 2147483647;',
    'files = ( ' + ids.buildSwift + ' /* PortfolioPilotWidgets.swift in Sources */, );',
    'runOnlyForDeploymentPostprocessing = 0;']),
  obj('frameworks', 'Widget Frameworks', [
    'isa = PBXFrameworksBuildPhase;', 'buildActionMask = 2147483647;',
    'files = ( );', 'runOnlyForDeploymentPostprocessing = 0;']),
  obj('resources', 'Widget Resources', [
    'isa = PBXResourcesBuildPhase;', 'buildActionMask = 2147483647;',
    'files = ( );', 'runOnlyForDeploymentPostprocessing = 0;']),
  obj('embed', 'Embed App Extensions', [
    'isa = PBXCopyFilesBuildPhase;', 'buildActionMask = 2147483647;',
    'dstPath = "";', 'dstSubfolderSpec = 13;',
    'files = ( ' + ids.buildEmbed + ' /* PortfolioPilotWidgets.appex in Embed App Extensions */, );',
    'name = "Embed App Extensions";', 'runOnlyForDeploymentPostprocessing = 0;']),
  obj('target', 'PortfolioPilotWidgets', [
    'isa = PBXNativeTarget;',
    'buildConfigurationList = ' + ids.configList + ' /* Widget build configurations */;',
    'buildPhases = ( ' + ids.sources + ' /* Widget Sources */, ' + ids.frameworks +
      ' /* Widget Frameworks */, ' + ids.resources + ' /* Widget Resources */, );',
    'buildRules = ( );', 'dependencies = ( );',
    'name = PortfolioPilotWidgets;', 'productName = PortfolioPilotWidgets;',
    'productReference = ' + ids.product + ' /* PortfolioPilotWidgets.appex */;',
    'productType = "com.apple.product-type.app-extension";']),
  obj('proxy', 'Widget container proxy', [
    'isa = PBXContainerItemProxy;', 'containerPortal = ' + projectId + ' /* Project object */;',
    'proxyType = 1;', 'remoteGlobalIDString = ' + ids.target + ';',
    'remoteInfo = PortfolioPilotWidgets;']),
  obj('dependency', 'WidgetKit dependency', [
    'isa = PBXTargetDependency;', 'target = ' + ids.target + ' /* PortfolioPilotWidgets */;',
    'targetProxy = ' + ids.proxy + ' /* Widget container proxy */;']),
  buildConfig('debug', 'Debug'),
  buildConfig('release', 'Release'),
  obj('configList', 'Widget build configurations', [
    'isa = XCConfigurationList;',
    'buildConfigurations = ( ' + ids.debug + ' /* Debug */, ' + ids.release + ' /* Release */, );',
    'defaultConfigurationIsVisible = 0;', 'defaultConfigurationName = Release;'])
];

replaceOnce('\n\t};\n\trootObject = ' + projectId,
  '\n\n' + signature + '\n' + entries.join('') + '\t};\n\trootObject = ' + projectId);
writeFileSync(projectPath, pbx);
console.log('Installed PortfolioPilotWidgets in generated Capacitor SPM project; target bundle ' + metadata.bundleId + '.widgets.');
