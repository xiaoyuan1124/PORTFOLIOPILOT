import { test } from "node:test";
import assert from "node:assert/strict";
import { appStoreArchiveSigningSettings } from "./ios-signing-policy.mjs";

test("App Store signed archive never silently uses development profiles", () => {
  const args = appStoreArchiveSigningSettings("A1B2C3D4E5");
  assert.deepEqual(args, [
    "DEVELOPMENT_TEAM=A1B2C3D4E5",
    "CODE_SIGN_STYLE=Automatic",
    "CODE_SIGN_IDENTITY=Apple Distribution",
    "CODE_SIGNING_ALLOWED=YES"
  ]);
  assert(!args.some((s) => /Apple Development|iOS App Development/.test(s)));
});
test("reject a missing or incorrect Apple Team ID rather than signing for another team", () => {
  for (const id of ["", "WRONG", "com.sy1124.portfoliopilot", "A1B2C3D4E!", "A1B2C3D4E5\n"]) {
    assert.throws(() => appStoreArchiveSigningSettings(id), /APPLE_TEAM_ID/);
  }
});
