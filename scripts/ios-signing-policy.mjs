// App Store signing MUST be target-scoped in the generated Xcode project.
// A global CODE_SIGN_IDENTITY=Apple Distribution on the xcodebuild command
// line is also inherited by Swift Package targets and causes Xcode's
// "conflicting provisioning settings" error for Capacitor plugins.
//
// The containing App + WidgetKit Extension Release configurations explicitly
// choose Apple Distribution. CLI provides the authenticated Apple team only.
export const IOS_DISTRIBUTION_SIGNING_SETTING =
  '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";';

export function appStoreArchiveSigningSettings(teamId) {
  if (typeof teamId !== "string" || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error("Valid 10-character APPLE_TEAM_ID is required for App Store signing.");
  }
  return [
    `DEVELOPMENT_TEAM=${teamId}`,
    "CODE_SIGN_STYLE=Automatic"
  ];
}
