const {
  withInfoPlist,
  withEntitlementsPlist,
} = require("@expo/config-plugins");

/**
 * Expo Config Plugin for react-native-health (Apple HealthKit).
 *
 * Modifies the iOS project to:
 * 1. Add NSHealthShareUsageDescription and NSHealthUpdateUsageDescription to Info.plist
 * 2. Add HealthKit entitlements (com.apple.developer.healthkit)
 *
 * This is the iOS counterpart to ./withHealthConnect.js (Android).
 */
function withHealthKit(config) {
  // ── Step 1: Add HealthKit usage descriptions to Info.plist ─────────
  config = withInfoPlist(config, (cfg) => {
    if (!cfg.modResults.NSHealthShareUsageDescription) {
      cfg.modResults.NSHealthShareUsageDescription =
        "This app needs access to your Health data to display your daily step count.";
    }

    if (!cfg.modResults.NSHealthUpdateUsageDescription) {
      cfg.modResults.NSHealthUpdateUsageDescription =
        "This app needs access to update your Health data.";
    }

    return cfg;
  });

  // ── Step 2: Add HealthKit entitlements ─────────────────────────────
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.healthkit"] = true;

    if (!cfg.modResults["com.apple.developer.healthkit.access"]) {
      cfg.modResults["com.apple.developer.healthkit.access"] = [];
    }

    return cfg;
  });

  return config;
}

module.exports = withHealthKit;
