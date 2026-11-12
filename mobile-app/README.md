# DCDS Capacitor mobile app

This folder adds a separate Capacitor 8 packaging layer for De Champions Digital Service. The existing root website remains the source of truth and is not moved or rewritten.

## Identity

- App name: De Champions Digital Service
- Proposed application ID: `com.dechampions.dcds`
- Capacitor web directory: `www` (generated during builds; not committed)

Confirm the application ID is available in Google Play Console and App Store Connect before the first public release. Store identifiers should be treated as permanent.

## Requirements

- Node.js 22 or newer
- npm
- Android builds: Android Studio 2025.2.1 or newer and Android SDK Platform 24 or newer
- iOS builds: macOS with Xcode 26 or newer and Xcode Command Line Tools

Capacitor 8 platform requirements are described in the official [environment setup guide](https://capacitorjs.com/docs/getting-started/environment-setup).

## Prepare and validate the web bundle

From this directory:

```bash
npm ci
npm run build
```

The build script copies an explicit allowlist of public DCDS pages, including the privacy notice and account-deletion pages, the current PWA manifest, public AI knowledge-base JSON, and existing assets into `www/`.

It does not copy Supabase migrations, Edge Function source, secrets, or repository administration files. It also prevents the website service worker from registering inside the local Capacitor WebView; the production website files remain unchanged.

## Official app branding

`branding/dcds-logo.png` is the approved DCDS logo source. After `npx cap add android` or `npx cap add ios`, apply platform assets with:

```bash
python -m pip install Pillow==11.3.0
python scripts/apply-branding.py android
# or
python scripts/apply-branding.py ios
```

The script preserves the logo artwork and produces the required launcher/app icon sizes, Android adaptive icon resources, and platform splash images. It modifies only the generated native project folders.

## Native build automation

The workflow `.github/workflows/dcds-native-mobile-builds.yml` creates and commits `mobile-app/package-lock.json` to the PR source branch on its first run when the file is missing. Both native jobs then check out that updated branch and use `npm ci` against the committed lockfile. This pins the exact npm dependency tree across subsequent workflow runs and both platforms.

The workflow runs on changes to the mobile app or workflow, and can also be started manually. It queues runs rather than cancelling an active iOS build. After generating each native project, it applies the official source logo from `branding/dcds-logo.png` to platform icons and splash artwork using the pinned Pillow image tool.

Successful runs publish short-lived artifacts:

- Android: debug APK and generated Android project source archive.
- iOS: unsigned iOS Simulator app and generated iOS project source archive.
- Dependency lockfile: the exact npm resolution used by both native builds.

The Android APK is for testing, not Play Store release. The iOS artifact is a Simulator build and cannot be installed on a physical iPhone. Neither artifact is a signed store release.

## Local native project generation

After the web bundle passes validation:

```bash
npm run platform:add:android
npm run platform:add:ios
npm run sync
```

Open the projects:

```bash
npm run android:open
npm run ios:open
```

Do not commit signing keys, passwords, provisioning credentials, local SDK paths, or build output.

## Windows / Microsoft Store

Windows is a separate distribution track; Capacitor's native targets here are Android and iOS. Use the HTTPS production PWA URL with [PWABuilder](https://www.pwabuilder.com/) to run readiness checks and generate the Windows Store package, then submit it through [Microsoft Partner Center](https://partner.microsoft.com/dashboard).

Follow Microsoft's [official PWA publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store). The production website PWA is the source for this route; do not use the native Capacitor `www/` directory as the Windows PWA source.

## Release boundary

This pipeline does not create signed Android App Bundles or iOS device archives. It does not enable Google Play Billing, Apple In-App Purchase/StoreKit, push notifications, or deep links. Physical-device testing, store billing, privacy review, account-deletion deployment/testing, signing, and store submission remain separate release gates. Track them in [STORE-RELEASE-CHECKLIST.md](./STORE-RELEASE-CHECKLIST.md).

The existing website and Flutterwave web checkout are not modified by this mobile packaging layer.
