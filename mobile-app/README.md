# DCDS Capacitor mobile app

This folder adds a separate Capacitor 8 packaging layer for De Champions Digital Service. The existing root website remains the source of truth and is not moved or rewritten.

## Identity

- App name: De Champions Digital Service
- Proposed application ID: `com.dechampions.dcds`
- Capacitor web directory: `www` (generated locally; intentionally not committed)

**Important:** confirm the application ID is available in Google Play Console and App Store Connect before the first public release. Store identifiers should be treated as permanent.

## Requirements for local native development

- Node.js 22 or newer and npm
- Android builds: Android Studio and Android SDK
- iOS builds: macOS, Xcode, and Xcode Command Line Tools

Capacitor 8 platform requirements are described in the official [environment setup guide](https://capacitorjs.com/docs/getting-started/environment-setup).

## Prepare and validate the web bundle

From this directory:

```bash
npm install
npm run build
```

The build script copies the DCDS public page allowlist, the current PWA manifest, the public AI knowledge-base JSON, and the existing assets directory into `www/`. The list includes student and administrative route shells already in the web app; their existing server-side role checks remain essential and must be tested on devices.

It does not copy Supabase migrations, Edge Function source, secrets, or repository administration files. It also prevents the website service worker from registering inside the local Capacitor WebView; the production website files remain unchanged.

## Generate native projects locally

After the web bundle passes validation:

```bash
npm run build:web
npm run platform:add:android
npm run platform:add:ios
npm run sync
```

Open the projects:

```bash
npm run android:open
npm run ios:open
```

Do not commit signing keys, passwords, provisioning credentials, local SDK paths, or build output. Review generated native projects before using them for release builds.

## Automated native build pipeline

The GitHub Actions workflow `.github/workflows/dcds-native-mobile-builds.yml` generates Android and iOS projects on hosted build runners whenever mobile files change in a pull request or on `main`. It also supports manual dispatch.

On a successful run, GitHub Actions publishes two short-lived artifacts (14-day retention):
- Android: debug APK plus generated Android project source archive.
- iOS: unsigned iOS Simulator app plus generated iOS project source archive.

The Android APK is for installation/testing only, not Play Store release. The iOS artifact is a Simulator build and cannot be installed on a physical iPhone. Neither artifact is a signed store release. Signing, physical-device testing, store billing, privacy/account deletion, and submission remain separate release gates.

## Windows / Microsoft Store

Windows is a separate distribution track; Capacitor's native targets here are Android and iOS. DCDS already has a PWA manifest and service worker in the root website. For Windows, use the HTTPS production PWA URL with [PWABuilder](https://www.pwabuilder.com/) to run its readiness checks and generate the Windows Store package, then submit it through [Microsoft Partner Center](https://partner.microsoft.com/dashboard).

Follow Microsoft's [official PWA publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store). The production website PWA is the source for this route; do not use the native Capacitor `www/` directory as the Windows PWA source.

## Release boundary

This pipeline does not create signed Android App Bundles or iOS archives. It does not enable Google Play Billing, Apple In-App Purchase/StoreKit, push notifications, deep links, or account deletion. Windows packaging and Partner Center submission are also pending. Track remaining work in [STORE-RELEASE-CHECKLIST.md](./STORE-RELEASE-CHECKLIST.md).

The existing website and Flutterwave web checkout are not modified by this mobile packaging layer.
