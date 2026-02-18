// Browser bundle IDs (apps where TLD changes create activity boundaries)
const BROWSER_BUNDLE_IDS = new Set([
  'com.apple.Safari',
  'com.google.Chrome',
  'com.google.Chrome.canary',
  'org.chromium.Chromium',
  'com.brave.Browser',
  'com.microsoft.edgemac',
  'com.operasoftware.Opera',
  'com.vivaldi.Vivaldi',
  'company.thebrowser.Browser', // Arc
  'org.mozilla.firefox',
  'org.mozilla.firefoxdeveloperedition',
  'com.sigmaos.sigmaos',
  'org.webkit.MiniBrowser',
])

// Transient apps that shouldn't end the current activity (brief overlays)
const TRANSIENT_APP_BUNDLE_IDS = new Set([
  'com.apple.Spotlight',
  'com.apple.notificationcenterui',
  'com.apple.controlcenter',
  'com.apple.screencaptureui',
  'com.apple.ScreenSaver.Engine',
  'com.apple.loginwindow',
])

// Browser process names for platforms without bundle IDs (Windows, Linux)
const BROWSER_PROCESS_NAMES = new Set([
  'Google Chrome',
  'Chromium',
  'Brave Browser',
  'Microsoft Edge',
  'Opera',
  'Vivaldi',
  'Firefox',
  'Safari',
  'Arc',
  // Windows executable names (without .exe)
  'chrome',
  'msedge',
  'brave',
  'opera',
  'vivaldi',
  'firefox',
])

// Transient app process names for platforms without bundle IDs
const TRANSIENT_PROCESS_NAMES = new Set([
  // Windows equivalents
  'SearchUI',
  'SearchApp',
  'ShellExperienceHost',
  'ActionCenter',
])

export function isBrowserApp(app: { bundleId?: string; processName: string }): boolean {
  if (app.bundleId && BROWSER_BUNDLE_IDS.has(app.bundleId)) return true
  return BROWSER_PROCESS_NAMES.has(app.processName)
}

export function isTransientApp(app: { bundleId?: string; processName: string }): boolean {
  if (app.bundleId && TRANSIENT_APP_BUNDLE_IDS.has(app.bundleId)) return true
  return TRANSIENT_PROCESS_NAMES.has(app.processName)
}
