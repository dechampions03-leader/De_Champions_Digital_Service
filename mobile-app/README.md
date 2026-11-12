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

## Current scope

This foundation does not yet create signed APK/AAB or IPA files. It also does not enable store billing, push notifications, deep links, account deletion, or store submission. Those items are tracked in [STORE-RELEASE-CHECKLIST.md](./STORE-RELEASE-CHECKLIST.md) and must be completed and tested before release.

The existing website and Flutterwave web checkout are not modified by this mobile packaging layer.
