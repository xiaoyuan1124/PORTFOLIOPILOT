import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const result = spawnSync(npmCommand, ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORTFOLIOPILOT_NATIVE: "true"
  }
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
