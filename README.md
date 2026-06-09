# Pixel Prop Webroot

A lightweight, production-ready WebUI dashboard designed for managing Android system properties and certified fingerprints directly through KernelSU. 

This project serves as the graphical interface for the Build-Prop-BETA module, providing real-time hardware telemetry and configuration management without relying on external dependencies.

## Key Features

* **Native KSU Integration**: Securely executes root-level shell commands (`getprop`, `cat`) via the built-in KernelSU JavaScript API.
* **Real-Time Property Sync**: Automatically parses and visualizes system properties alongside module-specific configurations like `pif.json`.
* **Automated OTA Verification**: Integrates directly with the GitHub API to compare local module versions against the latest release.
* **Resilient Architecture**: Built with modular ES6 JavaScript, utilizing asynchronous command execution with built-in timeout fallbacks to prevent memory leaks.
* **Dynamic Theming**: Fluid user interface utilizing CSS custom properties for seamless light and dark mode switching.

## Architecture & Stack

This dashboard is built with a zero-dependency philosophy to ensure maximum performance and security within the root environment.

* **Frontend**: Vanilla HTML5, CSS3 (Flexbox/Grid, CSS Variables)
* **Logic**: Vanilla JavaScript (ES6 Modules)
* **API Communication**: Fetch API for GitHub releases and intent routing
* **System Bridge**: KernelSU WebUI execution environment

## Development & Testing

Since this WebUI relies on the KernelSU API (`ksu.exec`) for system-level operations, full functionality can only be tested directly on a rooted Android device with the module installed.

1. Clone the repository.
2. Package the files into your Magisk/KernelSU module zip.
3. Flash the module via the KernelSU manager app.
4. Open the module's WebUI directly from the manager dashboard.

For UI and layout modifications, you can run a local development server (e.g., Live Server or Python `http.server`). Note that system properties will display fallback errors outside the KernelSU environment.
