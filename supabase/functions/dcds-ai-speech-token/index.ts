import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const VOICE_INSTRUCTIONS = [
  "You are the natural speech voice for De Champions Digital Service (DCDS).",
  "Read the supplied DCDS assistant response exactly as written. Do not summarise, paraphrase, add a greeting, add commentary, omit details, or answer the question yourself.",
  "Use a natural adult female-sounding voice: warm, smooth, confident, mature, friendly and beautifully conversational.",
  "Speak with subtle human-like intonation, gentle emotional expression, clear pronunciation and a comfortable natural pace.",
  "Avoid a childish, cartoonish, doll-like, sing-song, exaggeratedly sweet, overly breathy or robotic delivery.",
  "Do not sing, whisper, laugh, or add sound effects.",
  "Preserve the wording, numbers, course names and prices accurately.",
].join(" ");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ success: false, error: "Please sign in to use DCDS AI voice." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? (() => {
      try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; }
      catch { return undefined; }
    })();
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !publishableKey) {
    return json({ success: false, error: "DCDS authentication is not configured." }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ success: false, error: "Your DCDS session is invalid. Please sign in again." }, 401);
  }

  const verifiedContact = Boolean(user.email_confirmed_at || user.phone_confirmed_at);
  if (user.is_anonymous === true || !verifiedContact) {
    return json({
      success: false,
      error: "DCDS AI voice is available only to verified DCDS students and authorised administrators.",
    }, 403);
  }

  const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_dcds_admin");
  if (adminCheckError) {
    console.error("DCDS AI voice administrator check failed:", adminCheckError.message);
    return json({ success: false, error: "The DCDS access check is temporarily unavailable." }, 503);
  }

  const isAuthorisedAdmin = isAdmin === true;
  if (!isAuthorisedAdmin) {
    const [policyResult, eligibilityResult] = await Promise.all([
      userClient.from("dcds_ai_access_settings")
        .select("adult_access_enabled,teen_access_enabled")
        .eq("id", 1).maybeSingle(),
      userClient.from("dcds_ai_access_eligibility")
        .select("age_band,access_status,guardian_consent_status,guardian_user_id,guardian_consent_reference,guardian_consent_at")
        .eq("user_id", user.id).maybeSingle(),
    ]);

    if (policyResult.error || !policyResult.data || eligibilityResult.error) {
      console.error("DCDS AI voice age-access check failed:",
        policyResult.error?.message ?? eligibilityResult.error?.message);
      return json({ success: false, error: "DCDS AI age-access verification is temporarily unavailable." }, 503);
    }

    const policy = policyResult.data;
    const eligibility = eligibilityResult.data;
    const adultAllowed = policy.adult_access_enabled === true
      && eligibility?.age_band === "18_plus"
      && eligibility.access_status === "approved"
      && eligibility.guardian_consent_status === "not_required";
    const teenAllowed = policy.teen_access_enabled === true
      && eligibility?.age_band === "13_17"
      && eligibility.access_status === "approved"
      && eligibility.guardian_consent_status === "verified"
      && Boolean(eligibility.guardian_user_id
        && eligibility.guardian_consent_reference
        && eligibility.guardian_consent_at);

    if (!adultAllowed && !teenAllowed) {
      return json({
        success: false,
        error: "DCDS AI voice is not enabled for this account. Complete the required eligibility and guardian-consent review, or contact DCDS support.",
      }, 403);
    }
  }

  const rateLimit = isAuthorisedAdmin ? 15 : 10;
  const { data: allowed, error: quotaError } = await userClient.rpc("dcds_consume_ai_request", {
    p_limit: rateLimit,
  });
  if (quotaError) {
    console.error("DCDS AI voice quota check failed:", quotaError.message);
    return json({ success: false, error: "The DCDS AI usage check is temporarily unavailable." }, 503);
  }
  if (allowed !== true) {
    return json({ success: false, error: "DCDS AI voice has reached the current usage limit. Please wait before listening again." }, 429);
  }

  if (!openAiApiKey) {
    return json({
      success: false,
      error: "DCDS natural AI voice is not configured yet. The administrator must add OPENAI_API_KEY to the Production Supabase Edge Function secrets.",
    }, 503);
  }

  const safetyDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("dcds-user:" + user.id),
  );
  const safetyIdentifier = Array.from(new Uint8Array(safetyDigest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + openAiApiKey,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "realtime",
          model: "gpt-realtime-2.1-mini",
          output_modalities: ["audio"],
          instructions: VOICE_INSTRUCTIONS,
          max_output_tokens: 4096,
          audio: {
            output: {
              voice: "marin",
              speed: 0.98,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    console.error("DCDS OpenAI voice token request failed:", error);
    return json({ success: false, error: "The natural voice service is temporarily unavailable. Please try again." }, 502);
  }

  if (!providerResponse.ok) {
    const providerError = await providerResponse.text();
    console.error("DCDS OpenAI voice token request returned:", providerResponse.status, providerError.slice(0, 1200));
    if (providerResponse.status === 401 || providerResponse.status === 403) {
      return json({ success: false, error: "The DCDS OpenAI voice credentials need attention. Please contact DCDS support." }, 503);
    }
    if (providerResponse.status === 429) {
      return json({ success: false, error: "DCDS natural voice has reached the OpenAI usage limit. Please try again later." }, 429);
    }
    return json({ success: false, error: "The natural voice service could not start. Please try again later." }, 502);
  }

  let tokenPayload: Record<string, unknown>;
  try {
    tokenPayload = await providerResponse.json();
  } catch {
    return json({ success: false, error: "The natural voice service returned an invalid response." }, 502);
  }

  const clientSecret = typeof tokenPayload.value === "string" ? tokenPayload.value : "";
  const expiresAt = typeof tokenPayload.expires_at === "number" ? tokenPayload.expires_at : null;
  if (!clientSecret || !expiresAt) {
    console.error("DCDS OpenAI voice token response did not contain a client secret.");
    return json({ success: false, error: "The natural voice service did not return a usable session." }, 502);
  }

  // Only the short-lived, voice-only session credential is returned to the browser.
  // The full OpenAI project API key never leaves this Edge Function.
  return json({
    success: true,
    client_secret: clientSecret,
    expires_at: expiresAt,
    model: "gpt-realtime-2.1-mini",
    voice: "marin",
  });
});
