/* Public CAPTCHA configuration for DCDS.
 * The public site key is safe to expose in the browser.
 * Keep the provider secret in Supabase Auth settings only.
 * Never put a Turnstile secret or GEMINI_API_KEY in this file.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: "0x4AAAAAAF-6IMlUuG_tynpI",
  authProtectionEnabled: true
});
