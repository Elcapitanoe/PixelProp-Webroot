# Pixel Prop Webroot

Zero-dependency WebUI dashboard and controller for Pixel Prop modules running on KernelSU and APatch environments.

## Features

### Telemetry & Module Discovery
- Three-tier dynamic module detection:
  1. Native `ksu.moduleInfo()` API lookup.
  2. Dynamic directory matching (`*[Pp]rops`) supporting both beta and non-beta modules.
  3. Author metadata fallback from `module.prop`.
- Live hardware telemetry comparing system `getprop` values against module spoof targets.
- Dual property resolution reading `pif.json` with fallback directly to `system.prop`.

### PIF Tools (Play Integrity Fix)
- Quick Apply (Offline / Instant): Deploys the active module's certified fingerprint straight to `/data/adb/modules/playintegrityfix/pif.json` in under 0.2s without network requests.
- Custom Online Build: Streams Google Beta OTA releases directly from stdout with zero temporary file disk overhead.
- First-class Pixel 10 and Pixel 11 series support:
  - Pixel 11 series: Kodiak (11 Pro XL), Grizzly (11 Pro), Cubs (11), Yogi (11 Pro Fold).
  - Pixel 10 series: Mustang (10 Pro XL), Blazer (10 Pro), Frankel (10), Rango (10 Pro Fold), Stallion (10a).
  - Legacy Pixel 6 through 9 series catalog.
- Accurate API level resolution: Maps release OS versions to valid Android SDK levels (e.g. Android 17 maps to SDK 37) to prevent integrity attestation rejections.

### TrickyStore Integration
- Targeted package discovery using native `ksu.listPackages()` with `pm` fallback.
- Curated `target.txt` builder focused on Google Play Services, Play Store, and financial/banking applications rather than bulk-hooking all installed apps.
- Hardware TEE broken state detection with automatic `!` bypass suffixing.

### Runtime Configuration & Maintenance
- In-app toggle controls for `config.prop` switches:
  - `pixelprops.sensitive.props`
  - `pixelprops.sensitive.pihooks`
  - `pixelprops.sensitive.device`
  - `pixelprops.sensitive.security_patch`
  - `pixelprops.sensitive.sdk`
- System quick actions:
  - Clear Google Play Services (GMS) & Framework (GSF) data.
  - Restart SystemUI.
  - Device reboot.

## Architecture

```
.
├── index.html              # Core single-page application layout
├── css/
│   └── style.css           # Pure CSS variables, responsive grids, and toggle components
├── js/
│   ├── ksu-interface.js    # KernelSU JavaScript bridge, native APIs, and folder resolver
│   ├── dashboard-core.js   # Navigation, telemetry syncing, and theme state
│   ├── pif-builder.js      # Fingerprint generation, SDK mapping, and OTA parser
│   ├── pif-ui-manager.js   # Wizard state engine with layout paint buffering
│   ├── settings-manager.js # config.prop parser/writer and system execution tasks
│   ├── tricky-store.js     # Target package filtering and target.txt manager
│   ├── ota-manager.js      # GitHub release comparison client
│   ├── intent-handler.js   # Android intent launcher via am start
│   ├── about-renderer.js   # Contributor and repository card generator
│   └── core-telemetry.js   # Lightweight console logger
└── json/                   # Project metadata and contributor profiles
```
