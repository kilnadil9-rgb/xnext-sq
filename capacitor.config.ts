/**
 * Capacitor configuration (RC2).
 *
 * Typed locally so the web build compiles before Capacitor packages are
 * installed; the shape matches @capacitor/cli's CapacitorConfig. When you run
 * the Android setup (see docs/ANDROID_RELEASE.md), the CLI reads this as-is.
 */

interface XnextCapacitorConfig {
  appId: string
  appName: string
  webDir: string
  android?: {
    allowMixedContent?: boolean
  }
  server?: {
    androidScheme?: string
  }
}

const config: XnextCapacitorConfig = {
  appId: 'app.xnext',
  appName: 'XNEXT',
  webDir: 'dist',
  server: {
    // https scheme keeps Web Crypto, geolocation, and cookies behaving like
    // the deployed site inside the WebView.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
