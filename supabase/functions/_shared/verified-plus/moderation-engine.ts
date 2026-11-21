/**
 * DCDS Verified+ network moderation domain engine.
 * Pure, provider-neutral and persistence-free. Trusted server code must load
 * every account, entitlement, age, restriction, parent-item and role input.
 * This module does not authenticate, persist, notify, scan files or sanction.
 */
export type NetworkAction = "view" | "publish_original" | "comment" | "reply" | "react" | "reshare";
export type NetworkAgeEligibility = "eligible" | "unresolved" | "ineligible";
export type NetworkRestrictionType = "posting_suspended" | "engagement_suspended" | "participation_suspended" | "safety_hold" | "permanent_ban";

export interface NetworkAccessContext {
  authenticated: boolean;
  accountStatus: "active" | "locked" | "disabled" | "deleted";
  identityApproved: boolean;
  membershipStatus: "inactive" | "active_monthly" | "active_lifetime" | "expired" | "cancelled" | "suspended";
  networkAgeEligibility: NetworkAgeEligibility;
  restriction?: { type: NetworkRestrictionType; expiresAt?: string | null } | null;
}
export interface NetworkAccessDecision {
  allowed: boolean;
  code: "ALLOW" | "AUTH_REQUIRED" | "ACCOUNT_NOT_ACTIVE" | "AGE_INELIGIBLE" | "AGE_REVIEW_REQUIRED" | "VERIFIED_PLUS_REQUIRED" | "MEMBERSHIP_INACTIVE" | "POSTING_RESTRICTED" | "ENGAGEMENT_RESTRICTED" | "PARTICIPATION_SUSPENDED" | "SAFETY_HOLD";
  reason: string;
}
const WRITE_ACTIONS: readonly NetworkAction[] = ["publish_original", "comment", "reply", "react", "reshare"];

function isRestrictionActive(restriction: NetworkAccessContext["restriction"], now: Date): boolean {
  if (!restriction) return false;
  if (!restriction.expiresAt) return true;
  const expiry = Date.parse(restriction.expiresAt);
  return !Number.isFinite(expiry) || expiry > now.getTime();
}

/**
 * All inputs are server-resolved. Unresolved age allows read-only access but
 * blocks social writes until DCDS approves the minimum-age/eligibility policy.
 */
export function authorizeNetworkAction(context: NetworkAccessContext, action: NetworkAction, now = new Date()): NetworkAccessDecision {
  const deny = (code: NetworkAccessDecision["code"], reason: string): NetworkAccessDecision => ({ allowed: false, code, reason });
  if (!context.authenticated) return deny("AUTH_REQUIRED", "Sign in to DCDS to access the member network.");
  if (context.accountStatus !== "active") return deny("ACCOUNT_NOT_ACTIVE", "This DCDS account is not active.");
  if (context.networkAgeEligibility === "ineligible") return deny("AGE_INELIGIBLE", "This account is not eligible for this network.");
  if (action !== "view" && context.networkAgeEligibility === "unresolved") {
    return deny("AGE_REVIEW_REQUIRED", "Network participation is disabled until age eligibility is resolved.");
  }
  if (isRestrictionActive(context.restriction, now)) {
    switch (context.restriction!.type) {
      case "permanent_ban":
      case "participation_suspended":
        return deny("PARTICIPATION_SUSPENDED", "Network participation is currently suspended.");
      case "safety_hold":
        if (action !== "view") return deny("SAFETY_HOLD", "Network interactions are paused during a safety review.");
        break;
      case "engagement_suspended":
        if (action !== "view") return deny("ENGAGEMENT_RESTRICTED", "Network engagement is currently suspended.");
        break;
      case "posting_suspended":
        if (action === "publish_original") return deny("POSTING_RESTRICTED", "Original posting is temporarily restricted.");
        break;
    }
  }
  if (action === "publish_original") {
    if (!context.identityApproved) return deny("VERIFIED_PLUS_REQUIRED", "Approved identity verification is required to publish original posts.");
    if (context.membershipStatus !== "active_monthly" && context.membershipStatus !== "active_lifetime") {
      return deny("MEMBERSHIP_INACTIVE", "An active Verified+ membership is required to publish original posts.");
    }
  }
  return { allowed: true, code: "ALLOW", reason: WRITE_ACTIONS.includes(action) ? "This network action is permitted." : "Network read access is permitted." };
}

export type NetworkContentSurface = "original_post" | "comment" | "reply" | "reshare";
export type ModerationDecision = "allow" | "reject" | "hold_for_review";
export type ModerationRiskSignal = "harassment" | "threat" | "hate" | "sexual_content" | "sexual_exploitation" | "child_safety" | "doxxing" | "fraud" | "impersonation" | "malicious_file" | "unknown_language";
export interface AllowedDcdsDestination { hostname: string; pathPrefix: string; }
export interface ModerateNetworkContentInput {
  surface: NetworkContentSurface;
  text: string;
  parentContextApproved?: boolean;
  referencedPostApproved?: boolean;
  riskSignals?: readonly ModerationRiskSignal[];
  duplicateSubmission?: boolean;
  recentSubmissionCount?: number;
}
export interface ModerationConfig {
  allowedDcdsDestinations?: readonly AllowedDcdsDestination[];
  maxTextLength?: number;
  maxRecentSubmissions?: number;
}
export interface ModerationResult {
  decision: ModerationDecision;
  reasonCodes: string[];
  requiresHumanReview: boolean;
  mayApplyAccountSanction: false;
  summary: string;
}

const EXPLICIT_URL = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;
const BARE_DOMAIN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|ng|app|dev|me|xyz|edu|gov|uk|info|biz|example|invalid|test)(?:\/[^\s<>"']*)?/gi;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SOCIAL_HANDLE = /(?:^|\s)@[a-z0-9_.]{2,}/i;
const PHONE_NUMBER = /(?:^|\D)(?:\+?\d[\d\s().-]{7,}\d)(?:$|\D)/;
const OBFUSCATED_URL = /\b(?:hxxps?:\/\/|www\s*\[\s*dot\s*\]|\[\s*dot\s*\]\s*(?:com|net|org|io|co|ng))\b/i;
const OFF_TOPIC_PATTERNS: readonly RegExp[] = [
  /\b(?:dating|date me|relationship advice|romantic partner|boyfriend|girlfriend)\b/i,
  /\b(?:weekend party|house party|club night|party invitation|social meetup)\b/i,
  /\b(?:giveaway|lifestyle updates|daily entertainment|celebrity gossip)\b/i,
  /\b(?:political campaign|vote for|campaign rally|religious solicitation)\b/i,
  /\b(?:follow my other page|grow my followers|subscribe to my channel)\b/i,
];
const OFF_PLATFORM_INVITATION: readonly RegExp[] = [
  /\bjoin (?:my|our) (?:whatsapp|telegram|discord|facebook|instagram|tiktok|snapchat) (?:group|channel|page)\b/i,
  /\b(?:dm|message|contact) me (?:on|via|through) (?:whatsapp|telegram|discord|instagram|facebook|tiktok|snapchat)\b/i,
  /\bfollow (?:me|my page) on (?:instagram|facebook|tiktok|x|twitter|snapchat)\b/i,
  /\b(?:move|continue) (?:this|the) conversation (?:to|on) (?:whatsapp|telegram|discord|instagram)\b/i,
];
const DCDS_TOPIC_PATTERNS: readonly RegExp[] = [
  /\b(?:dcds|de champions|academy|course|lesson|learning|learn|skill|skills)\b/i,
  /\b(?:graphic design|visual design|brand design|video editing|video production|ai image|ai video)\b/i,
  /\b(?:whiteboard animation|animation|motion graphics|web design|website|web development|coding|programming)\b/i,
  /\b(?:portfolio|creative project|design project|digital project|prototype|software|productivity tools?)\b/i,
  /\b(?:professional development|career preparation|digital creativity|innovation|creative work)\b/i,
];

function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n?/g, "\n").trim();
}
function cleanUrlCandidate(value: string): string {
  return value.replace(/[.,!?;:]+$/g, "");
}
function isAllowedDcdsUrl(candidate: string, destinations: readonly AllowedDcdsDestination[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : "https://" + candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return false;
  const host = parsed.hostname.toLowerCase();
  return destinations.some((destination) => {
    if (host !== destination.hostname.toLowerCase()) return false;
    const prefix = destination.pathPrefix || "/";
    if (prefix === "/") return true;
    const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return parsed.pathname === cleanPrefix || parsed.pathname.startsWith(cleanPrefix + "/");
  });
}
function findUnapprovedUrls(text: string, destinations: readonly AllowedDcdsDestination[]): string[] {
  const found = new Set<string>();
  for (const pattern of [EXPLICIT_URL, BARE_DOMAIN]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const candidate = cleanUrlCandidate(match[0]);
      if (!isAllowedDcdsUrl(candidate, destinations)) found.add(candidate);
    }
  }
  return [...found];
}
function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Deterministic pre-publication check. Obvious prohibited content is rejected;
 * uncertain or safety-signalled content is held. No result issues a strike.
 */
export function moderateNetworkContent(input: ModerateNetworkContentInput, config: ModerationConfig = {}): ModerationResult {
  const text = normalizeText(input.text ?? "");
  const reasons: string[] = [];
  const make = (decision: ModerationDecision, code: string, summary: string): ModerationResult => ({
    decision,
    reasonCodes: [...new Set([...reasons, code])],
    requiresHumanReview: decision === "hold_for_review",
    mayApplyAccountSanction: false,
    summary,
  });
  const destinations = config.allowedDcdsDestinations ?? [];
  const maxLength = config.maxTextLength ?? 10_000;
  const maxSubmissions = config.maxRecentSubmissions ?? 8;

  if (input.surface === "reshare") {
    if (text) return make("reject", "RESHARE_CAPTION_NOT_ALLOWED", "Reshares must be attributed reference cards without added captions.");
    if (!input.referencedPostApproved) return make("hold_for_review", "RESHARE_TARGET_NOT_CONFIRMED", "The server must confirm the original item is still approved and shareable.");
    return { decision: "allow", reasonCodes: [], requiresHumanReview: false, mayApplyAccountSanction: false, summary: "The approved item may be reshared as an attributed reference card." };
  }
  if (!text) return make("reject", "EMPTY_CONTENT", "Add content before submitting.");
  if (text.length > maxLength) return make("reject", "CONTENT_TOO_LONG", "The submitted text exceeds the permitted content length.");
  if (EMAIL_ADDRESS.test(text) || PHONE_NUMBER.test(text)) return make("reject", "PERSONAL_CONTACT_DETAILS", "Personal email addresses and phone numbers are not permitted.");
  if (SOCIAL_HANDLE.test(text)) return make("reject", "OFF_PLATFORM_HANDLE", "Off-platform social handles are not permitted.");
  if (OBFUSCATED_URL.test(text)) return make("reject", "OBFUSCATED_EXTERNAL_LINK", "Obfuscated external links are not permitted.");
  if (findUnapprovedUrls(text, destinations).length > 0) return make("reject", "UNAPPROVED_EXTERNAL_LINK", "Only an exact, approved DCDS HTTPS destination may be used.");
  if (matchesAny(text, OFF_PLATFORM_INVITATION)) return make("reject", "OFF_PLATFORM_SOCIAL_INVITATION", "Moving members to external social platforms or messaging groups is not permitted.");
  if (matchesAny(text, OFF_TOPIC_PATTERNS)) return make("reject", "OFF_BRAND_SOCIAL_CONTENT", "This content is outside DCDS learning, creativity, services and professional-development activities.");
  if ((input.surface === "comment" || input.surface === "reply") && !input.parentContextApproved) {
    return make("hold_for_review", "PARENT_CONTEXT_NOT_CONFIRMED", "The server must confirm that the parent item is approved and visible.");
  }
  if (input.duplicateSubmission) return make("hold_for_review", "POSSIBLE_DUPLICATE_SPAM", "Possible repeated content requires review or rate-limit handling.");
  if (typeof input.recentSubmissionCount === "number" && input.recentSubmissionCount >= maxSubmissions) {
    return make("hold_for_review", "SUBMISSION_RATE_REVIEW", "Submission rate is above the review threshold.");
  }
  if (input.riskSignals?.length) return make("hold_for_review", "SAFETY_SIGNAL_REVIEW", "A safety signal was raised. Keep the item hidden and route it to an authorised human reviewer.");
  const topic = matchesAny(text, DCDS_TOPIC_PATTERNS);
  if (!topic && (input.surface === "comment" || input.surface === "reply") && input.parentContextApproved) {
    return { decision: "allow", reasonCodes: [], requiresHumanReview: false, mayApplyAccountSanction: false, summary: "This short interaction is attached to a server-confirmed approved DCDS item." };
  }
  if (!topic) return make("hold_for_review", "DCDS_TOPIC_NOT_ESTABLISHED", "The DCDS connection is unclear. Hold for human review rather than publishing automatically.");
  return { decision: "allow", reasonCodes: [], requiresHumanReview: false, mayApplyAccountSanction: false, summary: "First-pass content checks passed; continue with server-side access, safety and publication controls." };
}

export interface ConfirmedStrikeEvent { occurredAt: string; confirmed: boolean; }
export type StrikeEnforcementAction = "warning_only" | "restrict_original_posting_7d" | "suspend_network_engagement_30d" | "root_review_required";
export interface StrikeEnforcementPlan {
  confirmedStrikeNumber: number;
  action: StrikeEnforcementAction;
  durationDays: 0 | 7 | 30 | 90;
  requiresRootApproval: boolean;
  contentMustBeRemoved: true;
  windowDays: 180;
  summary: string;
}
const STRIKE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
export function countConfirmedStrikesWithin180Days(events: readonly ConfirmedStrikeEvent[], now = new Date()): number {
  const lowerBound = now.getTime() - STRIKE_WINDOW_MS;
  return events.filter((event) => {
    if (!event.confirmed) return false;
    const timestamp = Date.parse(event.occurredAt);
    return Number.isFinite(timestamp) && timestamp >= lowerBound && timestamp <= now.getTime();
  }).length;
}
export function planNextStrikeEnforcement(priorConfirmedStrikesWithin180Days: number): StrikeEnforcementPlan {
  if (!Number.isInteger(priorConfirmedStrikesWithin180Days) || priorConfirmedStrikesWithin180Days < 0) {
    throw new RangeError("Prior confirmed strike count must be a non-negative integer.");
  }
  const number = priorConfirmedStrikesWithin180Days + 1;
  if (number === 1) return {
    confirmedStrikeNumber: number, action: "warning_only", durationDays: 0, requiresRootApproval: false,
    contentMustBeRemoved: true, windowDays: 180,
    summary: "Remove content, record strike 1 and issue a warning naming the violated rule.",
  };
  if (number === 2) return {
    confirmedStrikeNumber: number, action: "restrict_original_posting_7d", durationDays: 7, requiresRootApproval: false,
    contentMustBeRemoved: true, windowDays: 180,
    summary: "Remove content, record strike 2 and restrict original posting for 7 days.",
  };
  if (number === 3) return {
    confirmedStrikeNumber: number, action: "suspend_network_engagement_30d", durationDays: 30, requiresRootApproval: false,
    contentMustBeRemoved: true, windowDays: 180,
    summary: "Remove content, record strike 3 and suspend network posting and engagement for 30 days.",
  };
  return {
    confirmedStrikeNumber: number, action: "root_review_required", durationDays: 90, requiresRootApproval: true,
    contentMustBeRemoved: true, windowDays: 180,
    summary: "Escalate fourth or later strike to Root Administrator. A 90-day participation suspension requires human Root approval.",
  };
}

export interface ModerationActor {
  actorId: string;
  role: "moderator" | "root_administrator" | "automated_service";
  delegatedThirtyDayRestriction?: boolean;
}
export type ModerationAdminAction =
  | "approve_content" | "remove_content" | "issue_warning" | "record_strike"
  | "restrict_posting_7d" | "suspend_network_30d" | "temporary_safety_hold"
  | "request_root_review" | "suspend_participation_90d" | "permanent_network_ban" | "resolve_appeal";
export interface ModerationAuthorizationInput {
  actor: ModerationActor;
  action: ModerationAdminAction;
  caseSeverity?: "ordinary" | "severe";
  caseInSafetyHold?: boolean;
  typedConfirmation?: string;
  originalDecisionMakerId?: string;
}
export interface ModerationAuthorizationDecision {
  allowed: boolean;
  code: "ALLOW" | "AUTOMATION_CANNOT_DECIDE" | "ROLE_NOT_AUTHORIZED" | "DELEGATION_REQUIRED" | "SEVERE_CASE_REQUIRED" | "SAFETY_HOLD_REQUIRED" | "TYPED_CONFIRMATION_REQUIRED" | "INDEPENDENT_REVIEW_REQUIRED";
  reason: string;
}
export function authorizeModerationAdminAction(input: ModerationAuthorizationInput): ModerationAuthorizationDecision {
  const deny = (code: ModerationAuthorizationDecision["code"], reason: string): ModerationAuthorizationDecision => ({ allowed: false, code, reason });
  const allow = (): ModerationAuthorizationDecision => ({ allowed: true, code: "ALLOW", reason: "The actor is authorised for this moderation action." });
  const actor = input.actor;
  if (actor.role === "automated_service") return deny("AUTOMATION_CANNOT_DECIDE", "Automated checks cannot make formal sanctions or appeal decisions.");
  if (input.action === "resolve_appeal") {
    if (!input.originalDecisionMakerId || input.originalDecisionMakerId === actor.actorId) {
      return deny("INDEPENDENT_REVIEW_REQUIRED", "The original decision maker must not review their own appeal.");
    }
    return allow();
  }
  if (input.action === "suspend_participation_90d" || input.action === "permanent_network_ban") {
    if (actor.role !== "root_administrator") return deny("ROLE_NOT_AUTHORIZED", "Only Root Administrator may approve this long-term network restriction.");
  }
  if (input.action === "permanent_network_ban") {
    if (input.caseSeverity !== "severe") return deny("SEVERE_CASE_REQUIRED", "A permanent network ban requires a severe safety case.");
    if (!input.caseInSafetyHold) return deny("SAFETY_HOLD_REQUIRED", "The severe case must be in a temporary safety hold pending human review.");
    if (input.typedConfirmation !== "PERMANENT") return deny("TYPED_CONFIRMATION_REQUIRED", "Root Administrator must type PERMANENT to confirm this action.");
  }
  if (input.action === "suspend_network_30d" && actor.role !== "root_administrator" && !actor.delegatedThirtyDayRestriction) {
    return deny("DELEGATION_REQUIRED", "A moderator needs explicit senior delegation for a 30-day network suspension.");
  }
  return allow();
}
