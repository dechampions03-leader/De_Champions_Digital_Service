/* Public CAPTCHA configuration for DCDS.
 * The public site key is safe to expose in the browser. The matching
 * Turnstile secret is configured privately in Supabase Auth and the
 * DCDS account-creation Edge Function.
 * Never put a Turnstile secret or GEMINI_API_KEY in this file.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: "0x4AAAAAAF-6IMlUuG_tynpI",
  authProtectionEnabled: true
});
