# DCDS mobile store release checklist

This is the release gate for Google Play and Apple App Store. A successful Capacitor web-bundle check is not equivalent to store approval.

## Configured in this repository

- [x] Separate Capacitor project folder; existing website files stay at the repository root.
- [x] Proposed app name and reverse-domain application identifier.
- [x] Dedicated generated web asset directory and explicit public-file allowlist.
- [x] Existing DCDS page routes and images included in the mobile bundle.
- [x] PWA service-worker registration guarded from the local native WebView.
- [x] Automated static validation for page presence, HTML structure, manifest, and icon dimensions.
- [x] CI workflow to build and validate the web bundle.
- [x] No Supabase migrations, Edge Function source, or signing secrets copied into the app bundle.

## Required before native device testing

- [ ] Install Node.js 22+, Android Studio/Android SDK, and (on macOS) Xcode 26+.
- [ ] Generate and review Android and iOS native projects.
- [ ] Create a 1024x1024 app-store icon and complete platform-specific adaptive icon / launch-screen artwork.
- [ ] Configure Android package signing and iOS signing/provisioning securely.
- [ ] Test registration, email/phone verification, login, password recovery, session persistence, and sign-out on real devices.
- [ ] Test deep links and the Supabase redirect allowlist for the native app.
- [ ] Test Flutterwave checkout hand-off and payment return; confirm the server verifies each transaction before access is granted.
- [ ] Test video/course playback, assessments, support, admin role restrictions, offline handling, Android back navigation, and safe-area layouts.
- [ ] Confirm all third-party SDKs, fonts, CDN resources, and data flows are disclosed and behave reliably.

## Store policy blockers to resolve before submission

### Digital course payments

DCDS sells digital courses and learning access. Do not expose the website's Flutterwave checkout as the purchase path for digital course access in a store-distributed native build unless the applicable store rules and an approved regional/program exception permit it.

- [ ] Integrate and test Google Play Billing for new digital course purchases on Google Play, unless DCDS qualifies for and enrolls in an applicable alternative billing program.
- [ ] Integrate and test Apple In-App Purchase / StoreKit for new digital course purchases on the iOS App Store, unless an applicable entitlement or exception is approved.
- [ ] Implement trusted server-side purchase verification and entitlement reconciliation with Supabase.
- [ ] Implement restore / re-sync of eligible purchases and clear handling of cancellations, refunds, pending transactions, and account changes.
- [ ] Preserve the website's existing Flutterwave checkout for web customers. Do not change or remove it as part of this scaffold.
- [ ] Confirm the cross-platform access model for customers who purchased on the website against the current store rules.

Official policies: [Apple App Review Guidelines, section 3.1](https://developer.apple.com/app-store/review/guidelines/) and [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).

### Privacy and account deletion

- [ ] Publish a public DCDS privacy policy URL and link it inside the app.
- [ ] Document collection, use, sharing, retention, deletion, and third-party processors (including Supabase, Flutterwave, and any SDK/CDN providers actually used).
- [ ] Complete Apple's App Privacy disclosures and Google's Data safety form accurately.
- [ ] Add a readily discoverable in-app account deletion initiation flow.
- [ ] Publish an external DCDS account deletion request page and enter its URL in Play Console.
- [ ] Implement deletion processing that removes eligible personal data while preserving records that must legally be retained; document any such retention.
- [ ] Test the full deletion request and confirmation process end to end.

The current repository audit did not find a published privacy policy page or a complete account-deletion flow. These must not be represented as completed until implemented and tested.

Official references: [Apple privacy requirements](https://developer.apple.com/app-store/review/guidelines/), [App Store Connect privacy details](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy), and [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

### App quality and submission material

- [ ] Add app-specific mobile value beyond a website wrapper (for example, robust deep links, native notifications, and tested platform navigation).
- [ ] Provide Apple review with a working demo account or fully featured demo mode and keep the backend available during review.
- [ ] Prepare accurate store name, description, support contact, privacy policy, screenshots, age/content rating, and store artwork.
- [ ] Complete Google Play Data safety and target API declarations using the current requirements at submission time.
- [ ] Complete Apple App Privacy, export compliance, age rating, and app review notes.
- [ ] Register and verify the publisher-owned Google Play Console and Apple Developer accounts.
- [ ] Upload signed release builds to internal/closed testing first and resolve all findings before production submission.

## Not completed by the repository scaffold

- Native Android/iOS projects have not yet been generated.
- No Android or iOS binary has been compiled, installed on a device, signed, or submitted.
- No store accounts, product catalog, billing agreements, privacy policy, account-deletion workflow, signing certificates, or provisioning profiles have been created.
- No real mobile Flutterwave or store-billing payment has been tested.
- Store approval cannot be guaranteed; the platform owner must complete account verification, policy declarations, testing, and review responses.
