/* Public CAPTCHA configuration for the DCDS visitor page.
 * Add the Cloudflare Turnstile site key here after creating the widget.
 * Never put the Turnstile secret key or GEMINI_API_KEY in this file.
 */
window.DCDS_CAPTCHA_CONFIG = Object.freeze({
  provider: "turnstile",
  siteKey: ""
});
