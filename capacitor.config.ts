import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ma.payzik.pos",
  appName: "PAYZIK",
  webDir: "dist",
  loggingBehavior: "none",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#3A2A1F",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#3A2A1F",
      overlaysWebView: false,
    },
  },
};

export default config;
