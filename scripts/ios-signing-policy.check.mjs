import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appStoreArchiveSigningSettings,
  IOS_DISTRIBUTION_SIGNING_SETTING
} from "./ios-signing-policy.mjs";

test("App Store archive does not leak a signing identity into Swift Package targets", () => {
  const args = appStoreArchiveSigningSettings("A1B2C3D4E5");
  assert.deepEqual(args, [
    "DEVELOPMENT_TEAM=A1B2C3D4E5"
  ]);
  assert(!args.some(s => /CODE_SIGN_IDENTITY|CODE_SIGN_STYLE|PROVISIONING_PROFILE/.test(s)));
});

test("Release App and WidgetKit have one explicit Apple Distribution setting", () => {
  assert.equal(IOS_DISTRIBUTION_SIGNING_SETTING,
    '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";');
});

test("reject a missing or incorrect Apple Team ID rather than signing for another team", () => {
  for (const id of ["", "WRONG", "com.sy1124.portfoliopilot", "A1B2C3D4E!", "A1B2C3D4E5\n"]) {
    assert.throws(() => appStoreArchiveSigningSettings(id), /APPLE_TEAM_ID/);
  }
});
