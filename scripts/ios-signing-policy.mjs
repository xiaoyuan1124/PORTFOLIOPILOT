// Xcode's generated Capacitor Release targets default to Apple Development
// signing when no explicit certificate is chosen. CI has no registered test
// devices, and TestFlight is NOT an ad-hoc / development-device install.
// Force distribution identity for both App + embedded WidgetKit extension.
// The actual Apple-issued App Store profiles and App Groups are validated in
// verify-ios-signed-widget.mjs before any upload.
export function appStoreArchiveSigningSettings(teamId) {
  if (typeof teamId !== "string" || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error("Valid 10-character APPLE_TEAM_ID is required for App Store signing.");
  }
  return [
    `DEVELOPMENT_TEAM=${teamId}`,
    "CODE_SIGN_STYLE=Automatic",
    "CODE_SIGN_IDENTITY=Apple Distribution",
    "CODE_SIGNING_ALLOWED=YES"
  ];
}
