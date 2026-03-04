const { withMainActivity, withAndroidManifest } = require("@expo/config-plugins");

/**
 * Expo Config Plugin for react-native-health-connect.
 *
 * 1. Modifies MainActivity.kt to call HealthConnectPermissionDelegate.setPermissionDelegate(this)
 *    inside onCreate — this is required so that the library can launch the Health Connect
 *    permission dialog via registerForActivityResult().
 *
 * 2. Adds the Health Connect permission-rationale intent-filter and activity-alias to the
 *    AndroidManifest so that the system "privacy policy" link works on all API levels.
 */
function withHealthConnect(config) {
  // ── Step 1: Patch MainActivity.kt ──────────────────────────────────
  config = withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Add import if missing
    if (!contents.includes("HealthConnectPermissionDelegate")) {
      contents = contents.replace(
        /import com\.facebook\.react\.ReactActivity/,
        `import com.facebook.react.ReactActivity\nimport dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate`,
      );
    }

    // Add setPermissionDelegate call right after super.onCreate(…)
    if (!contents.includes("setPermissionDelegate")) {
      // Expo template uses super.onCreate(null)
      contents = contents.replace(
        /super\.onCreate\(null\)/,
        `super.onCreate(null)\n    // Health Connect: register the permission-result contract\n    HealthConnectPermissionDelegate.setPermissionDelegate(this)`,
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });

  // ── Step 2: Patch AndroidManifest.xml ──────────────────────────────
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return cfg;

    const mainActivity = application.activity?.find(
      (a) => a.$?.["android:name"] === ".MainActivity",
    );

    // Add the ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter to MainActivity
    // (needed for Android ≤13)
    if (mainActivity) {
      const intentFilters = mainActivity["intent-filter"] || [];
      const hasRationale = intentFilters.some((f) =>
        f.action?.some(
          (a) =>
            a.$?.["android:name"] ===
            "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE",
        ),
      );
      if (!hasRationale) {
        intentFilters.push({
          action: [
            {
              $: {
                "android:name":
                  "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE",
              },
            },
          ],
        });
        mainActivity["intent-filter"] = intentFilters;
      }
    }

    // Add the ViewPermissionUsageActivity activity-alias (needed for Android 14+)
    const activities = application["activity-alias"] || [];
    const hasAlias = activities.some(
      (a) => a.$?.["android:name"] === "ViewPermissionUsageActivity",
    );
    if (!hasAlias) {
      activities.push({
        $: {
          "android:name": "ViewPermissionUsageActivity",
          "android:exported": "true",
          "android:targetActivity": ".MainActivity",
          "android:permission":
            "android.permission.START_VIEW_PERMISSION_USAGE",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name":
                    "android.intent.action.VIEW_PERMISSION_USAGE",
                },
              },
            ],
            category: [
              {
                $: {
                  "android:name":
                    "android.intent.category.HEALTH_PERMISSIONS",
                },
              },
            ],
          },
        ],
      });
      application["activity-alias"] = activities;
    }

    return cfg;
  });

  return config;
}

module.exports = withHealthConnect;
