import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.env.RUNNER_TEMP;
if (!root) process.exit(0);
const dir = join(root, "portfoliopilot-manual-signing");
const list = join(dir, "installed-profiles.json");
if (existsSync(list)) {
  try {
    const paths = JSON.parse(readFileSync(list, "utf8"));
    if (Array.isArray(paths)) {
      for (const path of paths) {
        // Only remove profiles we explicitly installed. GitHub-hosted macOS
        // runners are ephemeral, but this also keeps self-hosted clean.
        if (typeof path === "string" &&
          /^.*\/Library\/MobileDevice\/Provisioning Profiles\/[0-9A-Fa-f-]{36}\.mobileprovision$/.test(path)) {
          rmSync(path, { force: true });
        }
      }
    }
  } catch { /* Best effort cleanup; do not log private materials. */ }
}
const keychain = join(dir, "distribution.keychain-db");
if (existsSync(keychain)) {
  spawnSync("security", ["delete-keychain", keychain], { stdio: "ignore" });
}
rmSync(dir, { recursive: true, force: true });
console.log("Ephemeral TestFlight signing files and keychain cleanup complete.");
