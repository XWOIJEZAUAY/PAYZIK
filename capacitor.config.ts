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
      backgroundColor: "#0B2846",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#060D18",
      overlaysWebView: false,
    },
  },
};

export default config;
