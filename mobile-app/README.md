# DCDS Capacitor mobile app

This folder adds a separate Capacitor 8 packaging layer for De Champions Digital Service. The existing root website remains the source of truth and is not moved or rewritten.

## Identity

- App name: De Champions Digital Service
- Proposed application ID: `com.dechampions.dcds`
- Capacitor web directory: `www` (generated locally; intentionally not committed)

**Important:** confirm the application ID is available in Google Play Console and App Store Connect before the first public release. Store identifiers should be treated as permanent.

## Requirements

- Node.js 22 or newer
- npm
- Android builds: Android Studio 2025.2.1 or newer and Android SDK Platform 24 or newer
- iOS builds: macOS, Xcode 26 or newer, Xcode Command Line Tools, and iOS 15+ deployment support

Capacitor 8 platform requirements are described in the official [environment setup guide](https://capacitorjs.com/docs/getting-started/environment-setup).

## Prepare and validate the web bundle

From this directory:

```bash
npm install
npm run build
```

The build script copies an explicit allowlist of public DCDS pages, the current PWA manifest, the public AI knowledge-base JSON, and the existing assets directory into `www/`.

It does not copy Supabase migrations, Edge Function source, secrets, or repository administration files. It also prevents the website service worker from registering inside the local Capacitor WebView; the production website files remain unchanged.

## Create native projects (one time)

After the web bundle passes validation:

```bash
npm run build:web
npm run platform:add:android
npm run platform:add:ios
```

The native project folders are source-controlled application projects and should be committed after generation and review. Do not commit signing keys, passwords, provisioning credentials, local SDK paths, or build output.

## Sync after web changes

```bash
npm run sync
```

Open the projects:

```bash
npm run android:open
npm run ios:open
```

## Windows / Microsoft Store

Windows is a separate distribution track; Capacitor's native targets here are Android and iOS. DCDS already has a PWA manifest and service worker in the root website. For Windows, use the HTTPS production PWA URL with [PWABuilder](https://www.pwabuilder.com/) to run its readiness checks and generate the Windows Store package, then submit it through [Microsoft Partner Center](https://partner.microsoft.com/dashboard).

Follow Microsoft's [official PWA publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store). The production website PWA is the source for this route; do not use the native Capacitor `www/` directory as the Windows PWA source.

## Current scope

This foundation does not yet create signed Android App Bundles or iOS archives. It also does not enable store billing, push notifications, deep links, account deletion, or store submission. Windows packaging and Partner Center submission are also pending. Those items are tracked in [STORE-RELEASE-CHECKLIST.md](./STORE-RELEASE-CHECKLIST.md) and must be completed and tested before release.

The existing website and Flutterwave web checkout are not modified by this mobile packaging layer.
