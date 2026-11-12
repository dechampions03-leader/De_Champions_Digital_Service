import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://dechampions03-leader.github.io",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
]);

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://dechampions03-leader.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function respond(req: Request, payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req.headers.get("Origin")), ...JSON_HEADERS },
  });
}

function cleanText(value: unknown, maximum = 1000): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maximum);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const ACTIVE_STATUSES = ["pending", "in_review", "action_required", "approved_for_deletion"];
const COMPLETION_KEYS = [
  "personal_data_reviewed",
  "learning_records_handled",
  "financial_audit_records_retained_as_required",
  "storage_and_third_party_reviewed",
];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return respond(req, { success: false, error: "Method not allowed." }, 405);
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return respond(req, { success: false, error: "This origin is not allowed." }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("DCDS_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return respond(req, { success: false, error: "Account privacy operations are temporarily unavailable." }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return respond(req, { success: false, error: "Please sign in to continue." }, 401);
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice(7);
    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user) {
      return respond(req, { success: false, error: "Your sign-in session is invalid. Please sign in again." }, 401);
    }

    const actor = authData.user;
    const body = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return respond(req, { success: false, error: "Invalid request information." }, 400);
    }
    const action = cleanText(body.action, 40);

    const { data: adminRow, error: adminLookupError } = await service
      .from("dcds_admins")
      .select("user_id")
      .eq("user_id", actor.id)
      .maybeSingle();
    if (adminLookupError) throw adminLookupError;
    const isAdmin = !!adminRow;

    if (action === "create_request") {
      if (!actor.email_confirmed_at && !actor.phone_confirmed_at) {
        return respond(req, { success: false, error: "Verify the email address or mobile number on your account before requesting deletion." }, 403);
      }
      if (cleanText(body.confirmation_phrase, 40) !== "DELETE MY ACCOUNT") {
        return respond(req, { success: false, error: "Type DELETE MY ACCOUNT exactly to confirm your request." }, 400);
      }

      const { data: existing, error: existingError } = await service
        .from("dcds_account_deletion_requests")
        .select("id,status,requested_at,updated_at")
        .eq("user_id", actor.id)
        .in("status", ACTIVE_STATUSES)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return respond(req, { success: true, request: existing, existing: true });
      }

      const requestNote = cleanText(body.request_note, 1000);
      const { data: created, error: createError } = await service
        .from("dcds_account_deletion_requests")
        .insert({
          user_id: actor.id,
          email_at_request: cleanText(actor.email, 254) || null,
          request_note: requestNote || null,
          status: "pending",
        })
        .select("id,status,requested_at,updated_at")
        .single();
      if (createError) {
        if (createError.code === "23505") {
          const { data: active } = await service
            .from("dcds_account_deletion_requests")
            .select("id,status,requested_at,updated_at")
            .eq("user_id", actor.id)
            .in("status", ACTIVE_STATUSES)
            .order("requested_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (active) return respond(req, { success: true, request: active, existing: true });
        }
        throw createError;
      }
      return respond(req, {
        success: true,
        request: created,
        message: "Your deletion request has been recorded. DCDS will review associated learning and transaction records before completing deletion.",
      });
    }

    if (action === "status") {
      const { data: requests, error } = await service
        .from("dcds_account_deletion_requests")
        .select("id,status,requested_at,updated_at,reviewed_at,review_note,completed_at")
        .eq("user_id", actor.id)
        .order("requested_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return respond(req, { success: true, requests: requests || [] });
    }

    if (action === "cancel") {
      const requestId = cleanText(body.request_id, 64);
      if (!isUuid(requestId)) return respond(req, { success: false, error: "Invalid deletion request." }, 400);
      const { data: request, error: readError } = await service
        .from("dcds_account_deletion_requests")
        .select("id,status")
        .eq("id", requestId)
        .eq("user_id", actor.id)
        .maybeSingle();
      if (readError) throw readError;
      if (!request) return respond(req, { success: false, error: "Deletion request not found." }, 404);
      if (request.status !== "pending") {
        return respond(req, { success: false, error: "Only a request that is still pending can be cancelled. Contact DCDS support for assistance." }, 409);
      }
      const { data: cancelled, error } = await service
        .from("dcds_account_deletion_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("user_id", actor.id)
        .eq("status", "pending")
        .select("id,status,updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!cancelled) return respond(req, { success: false, error: "The request changed before it could be cancelled. Refresh its status." }, 409);
      return respond(req, { success: true, request: cancelled });
    }

    if (action === "admin_list") {
      if (!isAdmin) return respond(req, { success: false, error: "Administrator access required." }, 403);
      const { data: requests, error } = await service
        .from("dcds_account_deletion_requests")
        .select("id,user_id,email_at_request,request_note,status,requested_at,updated_at,reviewed_by,reviewed_at,review_note,completion_checklist,completed_at")
        .order("requested_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return respond(req, { success: true, requests: requests || [] });
    }

    if (action === "admin_update") {
      if (!isAdmin) return respond(req, { success: false, error: "Administrator access required." }, 403);
      const requestId = cleanText(body.request_id, 64);
      const nextStatus = cleanText(body.status, 40);
      const note = cleanText(body.review_note, 1000);
      if (!isUuid(requestId)) return respond(req, { success: false, error: "Invalid deletion request." }, 400);

      const { data: request, error: readError } = await service
        .from("dcds_account_deletion_requests")
        .select("id,user_id,status")
        .eq("id", requestId)
        .maybeSingle();
      if (readError) throw readError;
      if (!request) return respond(req, { success: false, error: "Deletion request not found." }, 404);

      const timestamp = new Date().toISOString();
      const reviewPatch: Record<string, unknown> = {
        status: nextStatus,
        updated_at: timestamp,
        reviewed_by: actor.id,
        reviewed_at: timestamp,
        review_note: note,
      };

      if (nextStatus === "in_review") {
        if (!["pending", "action_required"].includes(request.status)) return respond(req, { success: false, error: "This request cannot move to review from its current status." }, 409);
        if (note.length < 20) return respond(req, { success: false, error: "Add a review note of at least 20 characters." }, 400);
      } else if (nextStatus === "action_required" || nextStatus === "rejected") {
        if (!["pending", "in_review", "action_required"].includes(request.status)) return respond(req, { success: false, error: "This request cannot move to that status." }, 409);
        if (note.length < 20) return respond(req, { success: false, error: "Add a clear note of at least 20 characters." }, 400);
      } else if (nextStatus === "approved_for_deletion") {
        if (request.status !== "in_review") return respond(req, { success: false, error: "Only a reviewed request can be approved for the final deletion step." }, 409);
        if (note.length < 30) return respond(req, { success: false, error: "Record the review evidence in a note of at least 30 characters." }, 400);
      } else if (nextStatus === "completed") {
        if (request.status !== "approved_for_deletion") return respond(req, { success: false, error: "The request must be approved before final deletion." }, 409);
        if (note.length < 50 || !isRecord(body.completion_checklist)) {
          return respond(req, { success: false, error: "Provide a final note of at least 50 characters and the complete checklist." }, 400);
        }
        const checklist = body.completion_checklist;
        const missing = COMPLETION_KEYS.filter((key) => checklist[key] !== true);
        if (missing.length) {
          return respond(req, { success: false, error: "Complete every data-handling attestation before deleting the Auth identity.", missing_checklist_items: missing }, 400);
        }

        // Do not automate destructive deletion of public records. The authorised
        // administrator must first verify that personal data has been erased or
        // anonymised and that records with a legal/audit need have been retained.
        // Only then is the Auth login identity deleted. The request's user_id is
        // intentionally not an FK, so the audit record remains.
        const { data: target, error: targetError } = await service.auth.admin.getUserById(request.user_id);
        if (targetError && !String(targetError.message || "").toLowerCase().includes("not found")) throw targetError;
        if (target?.user) {
          const { error: deleteError } = await service.auth.admin.deleteUser(request.user_id);
          if (deleteError) throw deleteError;
        }
        reviewPatch.completion_checklist = checklist;
        reviewPatch.completed_at = timestamp;
        reviewPatch.email_at_request = null;
        reviewPatch.request_note = null;
      } else {
        return respond(req, { success: false, error: "Unsupported deletion workflow status." }, 400);
      }

      const { data: updated, error: updateError } = await service
        .from("dcds_account_deletion_requests")
        .update(reviewPatch)
        .eq("id", requestId)
        .select("id,user_id,status,updated_at,reviewed_at,review_note,completed_at")
        .single();
      if (updateError) throw updateError;
      return respond(req, { success: true, request: updated });
    }

    return respond(req, { success: false, error: "Unsupported privacy action." }, 400);
  } catch (error) {
    console.error("DCDS account deletion service error:", error instanceof Error ? error.message : "Unknown error");
    return respond(req, { success: false, error: "DCDS could not complete this privacy request. Please try again or contact support." }, 500);
  }
});
