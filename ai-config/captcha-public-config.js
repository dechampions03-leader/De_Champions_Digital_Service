/* Public CAPTCHA configuration for DCDS.
 * The public site key is safe to expose in the browser.
 * Keep protection disabled in this shared homepage bundle while it points
 * to the Production Supabase project. Enable only in a Development-only
 * test build, or after a separately approved Production CAPTCHA rollout.
 * Never put a Turnstile secret or GEMINI_API_KEY in this file.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: "0x4AAAAAAF-6IMlUuG_tynpI",
  authProtectionEnabled: false
});
