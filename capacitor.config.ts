/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sy1124.portfoliopilot",
  appName: "PortfolioPilot",
  webDir: "out",
  plugins: {
    LocalNotifications: {
      presentationOptions: ["banner", "list"]
    }
  }
};

export default config;
