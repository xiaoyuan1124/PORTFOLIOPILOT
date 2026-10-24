import { test } from "node:test";
import assert from "node:assert/strict";
import {
  provisioningProfilesDir, profileInstallPath, isManagedProfilePath
} from "./ios-provisioning-paths.mjs";

const home = "/Users/runner";
const uuid = "00AABBCC-1122-3344-5566-778899AABBCC";

test("uses the Xcode 16+ UserData path required by Xcode 26", () => {
  assert.equal(provisioningProfilesDir(home),
    "/Users/runner/Library/Developer/Xcode/UserData/Provisioning Profiles");
  assert.equal(profileInstallPath(uuid, home),
    "/Users/runner/Library/Developer/Xcode/UserData/Provisioning Profiles/" + uuid + ".mobileprovision");
});

test("cleanup permits only a provision profile installed under this home", () => {
  const path = profileInstallPath(uuid, home);
  assert.equal(isManagedProfilePath(path, home), true);
  assert.equal(isManagedProfilePath(path, "/Users/another"), false);
  assert.equal(isManagedProfilePath(
    "/Users/runner/Library/MobileDevice/Provisioning Profiles/" + uuid + ".mobileprovision", home), false);
  assert.equal(isManagedProfilePath("/tmp/" + uuid + ".mobileprovision", home), false);
  assert.equal(isManagedProfilePath(path.replace(".mobileprovision", ".p12"), home), false);
  assert.equal(isManagedProfilePath(undefined, home), false);
});
test("rejects UUID and path traversal tricks", () => {
  for (const uuid of ["", "../../foo", "AAAA", "x".repeat(36), "../" + "A".repeat(36)]) {
    assert.throws(() => profileInstallPath(uuid, home), /UUID/);
  }
  assert.equal(isManagedProfilePath(profileInstallPath(uuid, home) + "/../file", home), false);
});
