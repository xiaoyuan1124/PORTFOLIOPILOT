import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const workflowsDir = join(process.cwd(), ".github", "workflows");
const files = readdirSync(workflowsDir).filter(name => /\.ya?ml$/.test(name));
assert(files.length >= 8, "Expected all PortfolioPilot CI workflows to be audited");

const freeGitHubActions = new Set([
  "actions/checkout", "actions/setup-node",
  "actions/configure-pages", "actions/upload-pages-artifact",
  "actions/deploy-pages", "actions/upload-artifact"
]);
const freeStandardRunners = new Set([
  "ubuntu-latest", "macos-26"
]);
const thirdPartyActions = new Set();
const unexpectedRunners = new Set();
const actionNames = new Set();
for (const file of files) {
  const content = readFileSync(join(workflowsDir, file), "utf8");
  for (const match of content.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
    const ref = match[1];
    const [action, version] = ref.split("@");
    if (!freeGitHubActions.has(action) || !/^v\d+$/.test(version ?? "")) {
      thirdPartyActions.add(file + ": " + ref);
    }
    actionNames.add(ref);
  }
  for (const match of content.matchAll(/^\s*runs-on:\s*([^\s#]+)/gm)) {
    if (!freeStandardRunners.has(match[1])) {
      unexpectedRunners.add(file + ": " + match[1]);
    }
  }
  assert(!content.includes("docker://"), file + " contains an unaudited container action");
}
assert.equal(thirdPartyActions.size, 0,
  "Non-official or unreviewed GitHub Actions need a cost and security review: " + [...thirdPartyActions].join(", "));
assert.equal(unexpectedRunners.size, 0,
  "Unreviewed (possibly billable) Runner labels found: " + [...unexpectedRunners].join(", "));
if (process.env.GITHUB_EVENT_PATH) {
  const evt = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  assert.notEqual(evt.repository?.private, true,
    "PortfolioPilot changed to private; standard runner minutes may become billable.");
}
console.log("PASS: " + files.length + " workflows use only standard runners and " +
  actionNames.size + " approved GitHub-maintained Actions; no paid Marketplace Actions detected.");
console.log("Reminder: repository must remain public and storage/runner policies must remain within GitHub's free terms.");
