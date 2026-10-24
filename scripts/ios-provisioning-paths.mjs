import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

// Xcode 16+ stores downloaded/manual profiles in UserData.
// Xcode 26 (the macos-26 GitHub runner) does NOT use the legacy
// ~/Library/MobileDevice/Provisioning Profiles location.
export function provisioningProfilesDir(home = homedir()) {
  if (typeof home !== "string" || !home.trim()) throw new Error("A home directory is required.");
  return join(home, "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles");
}

export function profileInstallPath(uuid, home = homedir()) {
  if (typeof uuid !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error("Invalid provisioning profile UUID");
  }
  return join(provisioningProfilesDir(home), uuid + ".mobileprovision");
}

export function isManagedProfilePath(file, home = homedir()) {
  if (typeof file !== "string") return false;
  const filename = basename(file);
  if (!filename.endsWith(".mobileprovision")) return false;
  try {
    const uuid = filename.slice(0, -".mobileprovision".length);
    return file === profileInstallPath(uuid, home) &&
      dirname(file) === provisioningProfilesDir(home);
  } catch { return false; }
}
