import {
  authorizeModerationAdminAction,
  authorizeNetworkAction,
  countConfirmedStrikesWithin180Days,
  moderateNetworkContent,
  planNextStrikeEnforcement,
  type NetworkAccessContext,
} from "./moderation-engine.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(message + ". Expected " + String(expected) + ", received " + String(actual) + ".");
}
function access(overrides: Partial<NetworkAccessContext> = {}): NetworkAccessContext {
  return {
    authenticated: true, accountStatus: "active", identityApproved: false,
    membershipStatus: "inactive", networkAgeEligibility: "eligible", ...overrides,
  };
}
const NOW = new Date("2026-11-21T12:00:00.000Z");
const ALLOWLIST = [{ hostname: "dcds.example", pathPrefix: "/learn" }];

Deno.test("signed-out visitors cannot view the member feed", () => {
  const r = authorizeNetworkAction(access({ authenticated: false }), "view", NOW);
  equal(r.code, "AUTH_REQUIRED", "Anonymous feed access");
});
Deno.test("standard signed-in users can view, comment, reply, react and reshare but cannot publish", () => {
  for (const action of ["view", "comment", "reply", "react", "reshare"] as const) {
    assert(authorizeNetworkAction(access(), action, NOW).allowed, action + " should be allowed");
  }
  equal(authorizeNetworkAction(access(), "publish_original", NOW).code, "VERIFIED_PLUS_REQUIRED", "Standard publishing gate");
});
Deno.test("publishing requires identity approval, active monthly or lifetime membership and eligible age", () => {
  const approved = access({ identityApproved: true, membershipStatus: "active_monthly" });
  assert(authorizeNetworkAction(approved, "publish_original", NOW).allowed, "Monthly member may publish");
  assert(authorizeNetworkAction({ ...approved, membershipStatus: "active_lifetime" }, "publish_original", NOW).allowed, "Lifetime member may publish");
  equal(authorizeNetworkAction({ ...approved, membershipStatus: "expired" }, "publish_original", NOW).code, "MEMBERSHIP_INACTIVE", "Expired member");
  equal(authorizeNetworkAction({ ...approved, identityApproved: false }, "publish_original", NOW).code, "VERIFIED_PLUS_REQUIRED", "Unverified member");
  equal(authorizeNetworkAction({ ...approved, networkAgeEligibility: "unresolved" }, "publish_original", NOW).code, "AGE_REVIEW_REQUIRED", "Age unresolved");
  equal(authorizeNetworkAction({ ...approved, networkAgeEligibility: "ineligible" }, "view", NOW).code, "AGE_INELIGIBLE", "Age ineligible");
});
Deno.test("unresolved age permits read-only access but blocks social write actions", () => {
  const c = access({ networkAgeEligibility: "unresolved" });
  assert(authorizeNetworkAction(c, "view", NOW).allowed, "Read access");
  equal(authorizeNetworkAction(c, "react", NOW).code, "AGE_REVIEW_REQUIRED", "Reaction gate");
  equal(authorizeNetworkAction(c, "comment", NOW).code, "AGE_REVIEW_REQUIRED", "Comment gate");
});
Deno.test("expired posting restrictions do not block posting", () => {
  const c = access({ identityApproved: true, membershipStatus: "active_monthly", restriction: { type: "posting_suspended", expiresAt: "2026-11-21T11:59:00.000Z" } });
  assert(authorizeNetworkAction(c, "publish_original", NOW).allowed, "Expired posting restriction");
});
Deno.test("active posting restriction blocks original posts but allows engagement", () => {
  const c = access({ restriction: { type: "posting_suspended", expiresAt: "2026-11-22T00:00:00.000Z" } });
  equal(authorizeNetworkAction(c, "publish_original", NOW).code, "POSTING_RESTRICTED", "Posting restriction");
  assert(authorizeNetworkAction(c, "comment", NOW).allowed, "Engagement remains permitted");
});
Deno.test("engagement suspension permits reading but blocks comments and reactions", () => {
  const c = access({ restriction: { type: "engagement_suspended", expiresAt: "2026-11-22T00:00:00.000Z" } });
  assert(authorizeNetworkAction(c, "view", NOW).allowed, "Feed view");
  equal(authorizeNetworkAction(c, "comment", NOW).code, "ENGAGEMENT_RESTRICTED", "Comment suspension");
  equal(authorizeNetworkAction(c, "react", NOW).code, "ENGAGEMENT_RESTRICTED", "Reaction suspension");
});
Deno.test("safety hold pauses writes but permits view", () => {
  const c = access({ restriction: { type: "safety_hold" } });
  assert(authorizeNetworkAction(c, "view", NOW).allowed, "Safety hold read");
  equal(authorizeNetworkAction(c, "reshare", NOW).code, "SAFETY_HOLD", "Safety hold write");
});
Deno.test("participation suspension and permanent ban block all network access", () => {
  for (const type of ["participation_suspended", "permanent_ban"] as const) {
    equal(authorizeNetworkAction(access({ restriction: { type } }), "view", NOW).code, "PARTICIPATION_SUSPENDED", type);
  }
});
Deno.test("external URLs, bare domains, emails and phone numbers are rejected", () => {
  const inputs = [
    "Join our workshop at https://evil.example/promo",
    "Open www.social-example.com/our-group",
    "Visit not-dcds.example/learn now",
    "Contact myteam@example.com for the details",
    "Call me on +234 803 123 4567",
  ];
  for (const text of inputs) equal(moderateNetworkContent({ surface: "original_post", text }).decision, "reject", text);
});
Deno.test("detects uncommon generic TLDs and multi-part domains", () => {
  for (const host of ["portfolio.example", "creator.ai", "design.tech", "brand.online", "academy.services", "site.com.ng"]) {
    const result = moderateNetworkContent({
      surface: "original_post",
      text: "Visit " + host + " for more.",
    });
    equal(result.decision, "reject", "External domain must be blocked: " + host);
  }
});
Deno.test("only exact HTTPS DCDS host and path allowlist passes", () => {
  const ok = moderateNetworkContent({ surface: "original_post", text: "The DCDS course details: https://dcds.example/learn/graphic-design" }, { allowedDcdsDestinations: ALLOWLIST });
  equal(ok.decision, "allow", "Allowlisted DCDS path");
  const wrongPath = moderateNetworkContent({ surface: "original_post", text: "Read https://dcds.example/learn-other/hidden" }, { allowedDcdsDestinations: ALLOWLIST });
  equal(wrongPath.decision, "reject", "Path segment boundary");
  const lookalike = moderateNetworkContent({ surface: "original_post", text: "Read https://dcds.example.attacker.test/learn/graphic-design" }, { allowedDcdsDestinations: ALLOWLIST });
  equal(lookalike.decision, "reject", "Lookalike host");
  const insecure = moderateNetworkContent({ surface: "original_post", text: "Read http://dcds.example/learn/graphic-design" }, { allowedDcdsDestinations: ALLOWLIST });
  equal(insecure.decision, "reject", "HTTP destination");
});
Deno.test("reserved example, invalid and test domains are still treated as external destinations", () => {
  for (const host of ["sample.example", "sample.invalid", "sample.test"]) {
    const result = moderateNetworkContent({
      surface: "original_post",
      text: "Open " + host + " for the details.",
    });
    equal(result.decision, "reject", "Reserved test-domain URL: " + host);
  }
});
Deno.test("off-platform handles, social invitations and unrelated social posts are rejected", () => {
  const inputs = [
    "Follow me @creative_daily for more.",
    "Join my WhatsApp group for more updates.",
    "Who is coming for the weekend party? Send me a DM.",
    "Follow my other page for lifestyle updates and daily entertainment.",
  ];
  for (const text of inputs) equal(moderateNetworkContent({ surface: "original_post", text }).decision, "reject", text);
});
Deno.test("relevant DCDS learning and portfolio content passes first-pass checks", () => {
  const r = moderateNetworkContent({ surface: "original_post", text: "I completed my graphic design course project and added the final work to my portfolio." });
  equal(r.decision, "allow", "DCDS project");
});
Deno.test("ambiguous original post is held rather than auto-published", () => {
  const r = moderateNetworkContent({ surface: "original_post", text: "I have an announcement to share with everyone today." });
  equal(r.decision, "hold_for_review", "Unclear DCDS topic");
  equal(r.requiresHumanReview, true, "Human review flag");
});
Deno.test("short comments require a server-confirmed approved parent item", () => {
  equal(moderateNetworkContent({ surface: "comment", text: "Excellent work. The layout is clean!", parentContextApproved: true }).decision, "allow", "Parent-approved comment");
  equal(moderateNetworkContent({ surface: "comment", text: "Excellent work." }).decision, "hold_for_review", "Unknown parent");
});
Deno.test("reshare is attributed-only and has no caption", () => {
  equal(moderateNetworkContent({ surface: "reshare", text: "", referencedPostApproved: true }).decision, "allow", "Approved reference reshare");
  equal(moderateNetworkContent({ surface: "reshare", text: "Join my other page.", referencedPostApproved: true }).decision, "reject", "Captioned reshare");
  equal(moderateNetworkContent({ surface: "reshare", text: "", referencedPostApproved: false }).decision, "hold_for_review", "Unverified original target");
});
Deno.test("safety signals and duplicate submissions cause a hold, not a sanction", () => {
  const risk = moderateNetworkContent({ surface: "original_post", text: "A DCDS learning project update.", riskSignals: ["doxxing"] });
  equal(risk.decision, "hold_for_review", "Risk signal");
  equal(risk.mayApplyAccountSanction, false, "Classifier cannot sanction");
  equal(moderateNetworkContent({ surface: "original_post", text: "My graphic design portfolio project is ready.", duplicateSubmission: true }).decision, "hold_for_review", "Duplicate content");
  equal(moderateNetworkContent({ surface: "original_post", text: "My video editing learning project is ready.", recentSubmissionCount: 9 }).decision, "hold_for_review", "Submission burst");
});
Deno.test("strike planner matches warning, seven-day, thirty-day and Root-review ladder", () => {
  equal(planNextStrikeEnforcement(0).action, "warning_only", "Strike one");
  equal(planNextStrikeEnforcement(1).durationDays, 7, "Strike two");
  equal(planNextStrikeEnforcement(2).durationDays, 30, "Strike three");
  const fourth = planNextStrikeEnforcement(3);
  equal(fourth.action, "root_review_required", "Strike four escalation");
  equal(fourth.durationDays, 90, "Root-reviewed recommended duration");
  equal(fourth.requiresRootApproval, true, "Root approval required");
  equal(fourth.contentMustBeRemoved, true, "Confirmed violating post removal");
});
Deno.test("rolling strike count includes confirmed events within 180 days only", () => {
  const count = countConfirmedStrikesWithin180Days([
    { occurredAt: "2026-11-01T12:00:00.000Z", confirmed: true },
    { occurredAt: "2026-08-01T12:00:00.000Z", confirmed: false },
    { occurredAt: "2026-04-01T11:59:59.000Z", confirmed: true },
    { occurredAt: "2026-11-22T12:00:00.000Z", confirmed: true },
    { occurredAt: "invalid-date", confirmed: true },
  ], NOW);
  equal(count, 1, "Only valid confirmed in-window strikes count");
});
Deno.test("negative prior strike counts are rejected", () => {
  let rejected = false;
  try { planNextStrikeEnforcement(-1); } catch (error) { rejected = error instanceof RangeError; }
  assert(rejected, "Negative strike count must throw");
});
Deno.test("moderators can remove content and place holds; 30-day suspension requires delegation", () => {
  const mod = { actorId: "mod-1", role: "moderator" as const };
  assert(authorizeModerationAdminAction({ actor: mod, action: "remove_content" }).allowed, "Moderator remove");
  assert(authorizeModerationAdminAction({ actor: mod, action: "temporary_safety_hold" }).allowed, "Moderator hold");
  equal(authorizeModerationAdminAction({ actor: mod, action: "suspend_network_30d" }).code, "DELEGATION_REQUIRED", "30-day delegation");
  assert(authorizeModerationAdminAction({ actor: { ...mod, delegatedThirtyDayRestriction: true }, action: "suspend_network_30d" }).allowed, "Delegated 30-day restriction");
});
Deno.test("Root Administrator alone may approve 90-day restrictions", () => {
  equal(authorizeModerationAdminAction({ actor: { actorId: "mod-1", role: "moderator" }, action: "suspend_participation_90d" }).code, "ROLE_NOT_AUTHORIZED", "Moderator denied");
  assert(authorizeModerationAdminAction({ actor: { actorId: "root-1", role: "root_administrator" }, action: "suspend_participation_90d" }).allowed, "Root allowed");
});
Deno.test("permanent network ban requires Root, severe case, safety hold and typed confirmation", () => {
  const base = { actor: { actorId: "root-1", role: "root_administrator" as const }, action: "permanent_network_ban" as const, caseSeverity: "severe" as const, caseInSafetyHold: true };
  equal(authorizeModerationAdminAction(base).code, "TYPED_CONFIRMATION_REQUIRED", "Typed confirmation");
  assert(authorizeModerationAdminAction({ ...base, typedConfirmation: "PERMANENT" }).allowed, "Root typed confirmation");
  equal(authorizeModerationAdminAction({ ...base, actor: { actorId: "mod-1", role: "moderator" }, typedConfirmation: "PERMANENT" }).code, "ROLE_NOT_AUTHORIZED", "Moderator ban denied");
  equal(authorizeModerationAdminAction({ ...base, caseSeverity: "ordinary", typedConfirmation: "PERMANENT" }).code, "SEVERE_CASE_REQUIRED", "Severe case required");
  equal(authorizeModerationAdminAction({ ...base, caseInSafetyHold: false, typedConfirmation: "PERMANENT" }).code, "SAFETY_HOLD_REQUIRED", "Safety hold required");
});
Deno.test("automated service cannot issue formal moderation sanctions", () => {
  equal(authorizeModerationAdminAction({ actor: { actorId: "system", role: "automated_service" }, action: "record_strike" }).code, "AUTOMATION_CANNOT_DECIDE", "Automated sanction denied");
});
Deno.test("appeal resolution must be made by someone other than the original decision maker", () => {
  equal(authorizeModerationAdminAction({ actor: { actorId: "mod-a", role: "moderator" }, action: "resolve_appeal", originalDecisionMakerId: "mod-a" }).code, "INDEPENDENT_REVIEW_REQUIRED", "Self-review denied");
  assert(authorizeModerationAdminAction({ actor: { actorId: "mod-b", role: "moderator" }, action: "resolve_appeal", originalDecisionMakerId: "mod-a" }).allowed, "Independent review allowed");
});
