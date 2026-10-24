import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkReleaseContract, releaseMetadataProblems, REQUIRED_TESTFLIGHT_SECRETS
} from "./release-preflight.mjs";

test("release candidate matches committed 1.0.0 (1) identity and eight-secret workflow", () => {
  assert.equal(REQUIRED_TESTFLIGHT_SECRETS.length, 8);
  assert.equal(new Set(REQUIRED_TESTFLIGHT_SECRETS).size, 8);
  assert.equal(checkReleaseContract(), true);
});

const good = () => ({
  metadata: { version: "1.0.0", buildNumber: "1", bundleId: "com.sy1124.portfoliopilot" },
  packageJson: { version: "1.0.0" },
  capacitorConfig: 'appId: "com.sy1124.portfoliopilot"',
  hostEntitlements: "<string>group.com.sy1124.portfoliopilot</string>",
  widgetEntitlements: "<string>group.com.sy1124.portfoliopilot</string>",
  uploadWorkflow: [
    'test "$CONFIRM_UPLOAD" = "UPLOAD"',
    'test "$CONFIRM_BUNDLE_ID" = "com.sy1124.portfoliopilot"',
    'test "$GITHUB_REF" = "refs/heads/main"',
    "portfolio-testflight",
    "Remove temporary private signing assets",
    ...REQUIRED_TESTFLIGHT_SECRETS.map((key) => "secrets." + key)
  ].join("\n")
});

test("rejects version mismatch and unexpected Bundle ID without touching user holdings", () => {
  const bad = good();
  bad.metadata.version = "1.0.1";
  bad.metadata.bundleId = "com.example.other";
  assert(releaseMetadataProblems(bad).some(p => p.includes("version 1.0.0")));
  assert(releaseMetadataProblems(bad).some(p => p.includes("Bundle ID")));
});

test("fails closed if production workflow loses an upload confirmation or a signing secret", () => {
  const bad = good();
  bad.uploadWorkflow = bad.uploadWorkflow.replace('test "$CONFIRM_UPLOAD" = "UPLOAD"', "");
  bad.uploadWorkflow = bad.uploadWorkflow.replace(
    "secrets.PORTFOLIOPILOT_IOS_WIDGET_PROFILE_BASE64", ""
  );
  const errors = releaseMetadataProblems(bad);
  assert(errors.some(p => p.includes("confirmation guard")));
  assert(errors.some(p => p.includes("IOS_WIDGET_PROFILE_BASE64")));
});

test("fails closed if WidgetKit App Group is omitted", () => {
  const bad = good();
  bad.widgetEntitlements = "<array/>";
  assert(releaseMetadataProblems(bad).some(p => p.includes("WidgetKit App Group")));
});

test("Windows bootstrap passes secret data via process stdin and blocks four-secret upload", () => {
  const source = readFileSync("scripts/bootstrap-testflight.ps1", "utf8");
  assert(source.includes("StandardInput.Write($Value)"));
  assert(!source.includes("--body $Secrets[$Name]"));
  assert(source.includes("if ($MissingSigning.Count -gt 0)"));
  for (const name of REQUIRED_TESTFLIGHT_SECRETS.slice(4)) {
    assert(source.includes(name), "Missing signing gate: " + name);
  }
});
