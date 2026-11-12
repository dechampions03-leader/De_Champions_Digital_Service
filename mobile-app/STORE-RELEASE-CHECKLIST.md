# DCDS mobile store release checklist

A successful web-bundle check, Android debug build, or iOS Simulator build is not equivalent to store approval or physical-device readiness.

## Configured in this repository

- [x] Separate Capacitor project folder; existing website files stay at the repository root.
- [x] Proposed app name and reverse-domain application identifier (availability still unconfirmed).
- [x] Dedicated generated web asset directory and explicit public-file allowlist.
- [x] Existing DCDS page routes, privacy notice, account-deletion pages, and images included in the mobile bundle.
- [x] PWA service-worker registration guarded from the local native WebView.
- [x] Automated static validation for page presence, HTML structure, manifest, and icon dimensions.
- [x] CI workflow configured to generate Android and iOS projects and compile an Android debug APK plus iOS Simulator app.
- [x] CI commits the generated npm lockfile to the source branch and both native jobs install from that committed lockfile using `npm ci`.
- [x] CI concurrency queues new runs rather than cancelling active iOS builds.
- [x] No Supabase migrations, Edge Function source, or signing secrets copied into the app bundle.
- [x] Generated Android and iOS native projects reviewed from successful CI artifacts; both use `com.dechampions.dcds`, and both display **De Champions Digital Service**.
- [x] Official DCDS logo stored as the mobile branding source and applied to Android/iOS app icons and splash artwork during CI builds.
- [x] Android adaptive icon foreground/background and monochrome launcher resources are generated from the approved logo.
- [x] iOS 1024x1024 App Store icon asset and splash image set are generated from the approved logo.
- [x] Native launch sequence configured: white icon-only OS launch, mobile-only DCDS name/tagline introduction, then fade to homepage.
- [x] AndroidX SplashScreen is installed before the Capacitor WebView; iOS launch storyboard uses correctly scaled portrait assets.
- [x] Native introduction is injected only into the Capacitor web bundle; the public website and its install-free homepage remain separate.

## Required before physical-device testing

- [ ] Obtain/approve a 1024x1024 master of the DCDS logo for final store artwork; the current public app-icon source is 512x512 and the generated 1024px store asset is upscaled for build validation.
- [ ] Configure Android release signing and iOS signing/provisioning securely.
- [ ] Test registration, email/phone verification, login, password recovery, session persistence, and sign-out on real devices.
- [ ] Test deep links and the Supabase redirect allowlist for the native app.
- [ ] Test Flutterwave checkout hand-off and payment return; confirm the server verifies each transaction before access is granted.
- [ ] Test video/course playback, assessments, support, admin role restrictions, offline handling, Android back navigation, and safe-area layouts.
- [ ] Confirm all third-party SDKs, fonts, CDN resources, and data flows are disclosed and behave reliably.

## Store policy blockers to resolve before submission

### Digital course payments

DCDS sells digital courses and learning access. Do not expose the website's Flutterwave checkout as the purchase path for digital course access in a store-distributed native build unless applicable store rules and an approved regional/program exception permit it.

- [ ] Integrate and test Google Play Billing for new digital course purchases on Google Play, unless DCDS qualifies for and enrolls in an applicable alternative billing program.
- [ ] Integrate and test Apple In-App Purchase / StoreKit for new digital course purchases on the iOS App Store, unless an applicable entitlement or exception is approved.
- [ ] Implement trusted server-side purchase verification and entitlement reconciliation with Supabase.
- [ ] Implement restore / re-sync of eligible purchases and clear handling of cancellations, refunds, pending transactions, and account changes.
- [ ] Preserve the website's existing Flutterwave checkout for web customers. Do not change or remove it as part of this scaffold.
- [ ] Confirm the cross-platform access model for customers who purchased on the website against the current store rules.

Official policies: [Apple App Review Guidelines, section 3.1](https://developer.apple.com/app-store/review/guidelines/) and [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).

### Privacy and account deletion

- [x] Add a DCDS privacy notice page and links from the public homepage, student portal and mobile bundle (legal review and production publication still required).
- [x] Add an external account-deletion request page and an authenticated request/status/cancellation workflow.
- [x] Add an admin-only deletion review console with a final manual data-handling attestation gate.
- [x] Keep the deletion-request audit record separate from the Auth user so it can survive login-identity deletion.
- [ ] Apply the database migration and deploy the account-deletion Edge Function after review.
- [ ] Review the privacy notice against actual processors, contracts, data retention and applicable legal advice.
- [ ] Complete Apple's App Privacy disclosures and Google's Data safety form accurately.
- [ ] Configure the account-deletion URL in Play Console and verify the external request route.
- [ ] Verify and test the required personal-data erasure/anonymisation and legal-retention process, including files and third-party processors.
- [ ] Run an end-to-end deletion test using a dedicated test account with related test records; never use a live customer account.

The current implementation is a controlled request/review workflow, not a claim that all related personal data is automatically erased. The final Auth identity deletion is only enabled after an authorised administrator confirms every required record-handling check.

Official references: [Apple privacy requirements](https://developer.apple.com/app-store/review/guidelines/), [App Store Connect privacy details](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy), and [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

### App quality and submission material

- [ ] Add app-specific mobile value beyond a website wrapper (for example, robust deep links, native notifications, and tested platform navigation).
- [ ] Provide Apple review with a working demo account or fully featured demo mode and keep the backend available during review.
- [ ] Prepare accurate store name, description, support contact, privacy policy, screenshots, age/content rating, and store artwork.
- [ ] Complete Google Play Data safety and target API declarations using current requirements at submission time.
- [ ] Complete Apple App Privacy, export compliance, age rating, and app review notes.
- [ ] Register and verify the publisher-owned Google Play Console and Apple Developer accounts.
- [ ] Upload signed release builds to internal/closed testing first and resolve findings before production submission.

## Windows / Microsoft Store release track

The Windows route uses the existing production PWA through PWABuilder and Microsoft Partner Center; it is not a Capacitor native platform.

- [x] Root website has a PWA manifest, HTTPS service-worker registration, and DCDS app icons.
- [ ] Run the production HTTPS URL through PWABuilder and resolve all reported action items.
- [ ] Enroll the publisher's Microsoft account in the Windows Developer Program and reserve the DCDS app name in Partner Center.
- [ ] Generate the Windows package with the exact Partner Center Package ID, Publisher display name, and Publisher ID.
- [ ] Install and test the packaged app on supported Windows versions, including sign-in, navigation, external payment hand-off, and updates.
- [ ] Submit the package and required store listing materials to Partner Center and pass Microsoft certification.

Official guide: [Publish a PWA to the Microsoft Store](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store).

## Not completed by the repository scaffold

- No signed Android App Bundle or iOS device archive has been produced.
- No physical Android/iPhone install or end-to-end mobile flow test has been completed.
- No store accounts, product catalog, billing agreements, signing certificates, or provisioning profiles have been configured.
- No real mobile Flutterwave or store-billing payment has been tested.
- Store approval cannot be guaranteed; the platform owner must complete account verification, policy declarations, testing, and review responses.
