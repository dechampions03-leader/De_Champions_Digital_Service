/* Public CAPTCHA configuration for DCDS.
 * Set the Cloudflare Turnstile site key only after the matching secret has
 * been saved in Supabase Authentication > Bot and Abuse Protection.
 * Never put a Turnstile secret or GEMINI_API_KEY in this file.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: "",
  authProtectionEnabled: false
});
