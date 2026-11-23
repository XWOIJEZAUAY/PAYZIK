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
      backgroundColor: "#0A2230",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0A2230",
      overlaysWebView: false,
    },
  },
};

export default config;
