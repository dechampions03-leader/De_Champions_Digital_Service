import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dechampions03-leader.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

function normalizePhone(value: unknown): string {
  const compact = String(value ?? "").trim().replace(/[\s().-]/g, "");
  const international = compact.startsWith("00") ? "+" + compact.slice(2) : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(international)) {
    throw new Error("Enter a valid international mobile number with + and the country calling code.");
  }
  return international;
}

function validReferralCode(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9]{6,16}$/.test(code)) {
    throw new Error("Referral codes must contain 6–16 letters or numbers.");
  }
  return code;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function phoneOtpEnabled(value: unknown): boolean {
  return value === true || value === "true";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "Method not allowed." }, 405);

  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://dechampions03-leader.github.io") {
    return respond({ success: false, error: "This origin is not allowed to create DCDS accounts." }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("DCDS_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return respond({ success: false, error: "DCDS account creation is temporarily unavailable." }, 503);
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const publicAuth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond({ success: false, error: "Invalid account request." }, 400);
    }

    const action = String(body.action || "");
    const { data: phoneSetting, error: settingError } = await service
      .from("dcds_auth_settings")
      .select("setting_value")
      .eq("setting_key", "phone_otp_enabled")
      .maybeSingle();

    if (settingError) {
      console.error("DCDS signup capability lookup failed:", settingError.message);
      return respond({ success: false, error: "DCDS verification settings are temporarily unavailable." }, 503);
    }

    const smsEnabled = phoneOtpEnabled(phoneSetting?.setting_value) && Deno.env.get("DCDS_SMS_OTP_PROVIDER_READY") === "true";

    if (action === "capabilities") {
      return respond({ success: true, phone_otp_enabled: smsEnabled });
    }

    if (action !== "create_phone_signup") {
      return respond({ success: false, error: "Unsupported account action." }, 400);
    }

    // Both the DB feature flag and this server-only readiness secret must be set after the SMS provider is actually configured.\n    if (!smsEnabled) {
      return respond({
        success: false,
        code: "PHONE_OTP_NOT_CONFIGURED",
        error: "Mobile verification is not enabled yet. Please choose email verification for now.",
      }, 503);
    }

    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const referralCode = validReferralCode(body.referral_code);

    if (password.length < 8 || password.length > 72) {
      return respond({ success: false, error: "Your password must contain between 8 and 72 characters." }, 400);
    }
    if (fullName.length < 2 || fullName.length > 100) {
      return respond({ success: false, error: "Please enter your full name." }, 400);
    }

    const emailFingerprint = await sha256(email);
    const phoneFingerprint = await sha256(phone);
    const ipAddress =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ipFingerprint = ipAddress ? await sha256(ipAddress) : null;

    const { data: allowed, error: rateLimitError } = await service.rpc(
      "dcds_internal_take_signup_attempt",
      {
        p_email_fingerprint: emailFingerprint,
        p_phone_fingerprint: phoneFingerprint,
        p_ip_fingerprint: ipFingerprint,
      },
    );
    if (rateLimitError) {
      console.error("DCDS mobile signup rate-limit check failed:", rateLimitError.message);
      return respond({ success: false, error: "Account creation is temporarily unavailable. Please try again shortly." }, 503);
    }
    if (allowed !== true) {
      return respond({ success: false, error: "Too many signup attempts. Please wait 15 minutes before trying again." }, 429);
    }

    const userMetadata: Record<string, unknown> = {
      full_name: fullName,
      dcds_phone_e164: phone,
      dcds_signup_verification_method: "sms",
    };
    if (referralCode) userMetadata.dcds_referral_code = referralCode;

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      phone,
      password,
      email_confirm: false,
      phone_confirm: false,
      user_metadata: userMetadata,
    });

    if (createError || !created.user) {
      // Avoid exposing whether a particular email or mobile number is registered.
      const message = createError?.message || "User creation did not return an account.";
      console.warn("DCDS phone signup was not created:", message);
      return respond({
        success: false,
        error: "We could not create this account. Check the email and mobile number, or try logging in if you already registered.",
      }, 409);
    }

    const { error: smsError } = await publicAuth.auth.resend({
      type: "sms",
      phone,
    });

    if (smsError) {
      const { error: rollbackError } = await service.auth.admin.deleteUser(created.user.id);
      if (rollbackError) console.error("DCDS rollback after SMS delivery failure failed:", rollbackError.message);
      console.error("DCDS SMS signup delivery failed:", smsError.message);
      return respond({
        success: false,
        error: "DCDS could not send the mobile verification code. No account was created. Please try email verification or contact support.",
      }, 502);
    }

    return respond({
      success: true,
      verification_method: "sms",
      message: "A six-digit verification code has been sent to your mobile number.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signup error";
    if (
      message.startsWith("Enter a valid") ||
      message.startsWith("Referral codes") ||
      message.startsWith("Your password") ||
      message.startsWith("Please enter")
    ) {
      return respond({ success: false, error: message }, 400);
    }
    console.error("DCDS account creation error:", message);
    return respond({ success: false, error: "DCDS could not complete your account request. Please try again." }, 500);
  }
});
