/* Public CAPTCHA configuration for DCDS.
 * The site key is public. Keep authProtectionEnabled false until the matching
 * Turnstile secret is saved in Supabase Auth Bot and Abuse Protection and the
 * DCDS account-creation Edge Function secret is configured.
 * Never put a Turnstile secret or GEMINI_API_KEY in this file.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: "0x4AAAAAAF-6IMlUuG_tynpI",
  authProtectionEnabled: false
});
