import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const teamId = process.env.APPLE_TEAM_ID?.trim();
if (!teamId) {
  throw new Error("APPLE_TEAM_ID is required.");
}

const output = resolve(
  process.env.EXPORT_OPTIONS_PATH || "build/ExportOptions-TestFlight.plist"
);
mkdirSync(dirname(output), { recursive: true });

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`;

writeFileSync(output, xml);
console.log(`Created TestFlight export options at ${output}`);
