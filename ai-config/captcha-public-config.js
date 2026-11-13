/* Public CAPTCHA configuration for DCDS Development preview.
 * The site key is public. Supabase Development stores the matching Turnstile
 * secret in its Auth CAPTCHA settings; never expose that secret here.
 * Production's separate branch retains its own disabled setting until a
 * separately approved Production CAPTCHA rollout.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: "0x4AAAAAAF-6IMlUuG_tynpI0",
  authProtectionEnabled: true
});