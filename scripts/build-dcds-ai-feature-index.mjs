import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUTPUT = "dcds-ai-feature-index.json";
const EXCLUDED = new Set([
  "offline.html", "payment-return.html", "delete-account.html",
  "privacy-policy.html", "dcds-ai-access-review.html",
  "admin-account-deletions.html", "student-management.html",
]);

// UI-only: never read JavaScript, CSS, migrations, server functions, environment
// files, form values, runtime records, private records or user-generated content.
const SENSITIVE_TEXT = /\b(api[\s_-]?key|secret|password|passcode|otp|one[- ]time code|bank|payout|withdraw|beneficiar(?:y|ies)|payment|transaction|account balance|card number|cvv|service[\s_-]?role|webhook|database|sql|schema|student record|moderator note|internal note|guardian code|quiz answer key|support ticket|date of birth|home address|phone number|email address)\b/i;
const SENSITIVE_HREF = /(payment|payout|withdraw|bank|delete-account|access-review|support-ticket|credentials?)/i;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
function getAttr(attributes, name) {
  const match = attributes.match(new RegExp("\\b" + name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i"));
  return match ? match[2] : "";
}
function decodeEntities(value) {
  return value.replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&#x2f;/gi, "/");
}
function stripMarkup(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function safeText(value, max = 220) {
  const text = stripMarkup(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || text.length > max || SENSITIVE_TEXT.test(text)) return "";
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text)) return "";
  if (/\b(?:\+?\d[\d\s().-]{8,}\d)\b/.test(text)) return "";
  if (/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(text)) return "";
  return text;
}
function cleanHtml(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|template|noscript|iframe|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<([a-z][\w:-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*["']true["']|\sstyle\s*=\s*["'][^"']*display\s*:\s*none))[^>]*>[\s\S]*?<\/\1>/gi, " ");
}
function explicitAudience(path) {
  if (/^admin-[a-z0-9-]+\.html$/i.test(path)) return "admin";
  if (/^student-[a-z0-9-]+\.html$/i.test(path) || path === "assessments.html") return "student";
  if (["index.html", "learn.html", "general-course.html", "ai-learning-assistant.html"].includes(path)) return "public";
  return "";
}
function extractPage(path, html, audience) {
  const clean = cleanHtml(html);
  const titleMatch = clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = safeText(titleMatch ? titleMatch[1] : path.replace(/\.html$/i, "").replace(/[-_]/g, " "), 140);
  let description = "";
  for (const match of clean.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = match[1];
    if (getAttr(attrs, "name").toLowerCase() === "description") {
      description = safeText(getAttr(attrs, "content"), 300);
      if (description) break;
    }
  }

  const sections = [];
  const actions = [];
  const links = [];
  const elementPattern = /<(h1|h2|h3|button|summary|label|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of clean.matchAll(elementPattern)) {
    const tag = match[1].toLowerCase();
    const attributes = match[2];
    const text = safeText(match[3], tag === "h1" ? 180 : 160);
    if (!text) continue;
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      if (!sections.includes(text)) sections.push(text);
    } else if (tag === "a") {
      const href = getAttr(attributes, "href").trim();
      if (!href || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
      const route = href.split(/[?#]/, 1)[0];
      if (route && SENSITIVE_HREF.test(route)) continue;
      if (!links.some((item) => item.label === text && item.href === href)) links.push({ label: text, href });
      if (actions.length < 60 && !actions.includes(text)) actions.push(text);
    } else if (actions.length < 60 && !actions.includes(text)) {
      actions.push(text);
    }
  }

  if (!description) {
    const paragraphs = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => safeText(match[1], 300)).filter((text) => text.length >= 45);
    description = paragraphs[0] || "";
  }
  return {
    path, title: title || path, audience, description,
    sections: sections.slice(0, 35), actions: actions.slice(0, 60),
    links: links.slice(0, 40),
  };
}
function fingerprint(page) {
  return JSON.stringify({
    title: page.title, description: page.description,
    sections: page.sections, actions: page.actions, links: page.links,
  });
}

const tracked = git(["ls-files", "-z"]).split("\0")
  .filter((path) => path.endsWith(".html") && !path.includes("/") && !EXCLUDED.has(path))
  .sort();
const candidates = new Map();
for (const path of tracked) {
  const audience = explicitAudience(path);
  if (!audience) continue;
  const page = extractPage(path, readFileSync(path, "utf8"), audience);
  if (page.sections.length || page.description) candidates.set(path, page);
}

// Discover additional pages linked from classified DCDS pages. Their access
// audience inherits the most restrictive source page that links to them.
const precedence = { public: 0, student: 1, admin: 2 };
const inbound = new Map();
for (const page of candidates.values()) {
  for (const link of page.links) {
    const target = link.href.split(/[?#]/, 1)[0];
    if (!target || !target.endsWith(".html") || target.includes("/") || EXCLUDED.has(target)) continue;
    const old = inbound.get(target);
    if (!old || precedence[page.audience] > precedence[old]) inbound.set(target, page.audience);
  }
}
for (const [path, audience] of inbound) {
  if (candidates.has(path) || !tracked.includes(path)) continue;
  const page = extractPage(path, readFileSync(path, "utf8"), audience);
  if (page.sections.length || page.description) candidates.set(path, page);
}

const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")) : { pages: [] };
const previousPages = new Map((Array.isArray(previous.pages) ? previous.pages : []).map((page) => [page.path, page]));
const pages = [...candidates.values()].sort((a, b) => a.path.localeCompare(b.path));
const recentChanges = [];
for (const page of pages) {
  const old = previousPages.get(page.path);
  if (!old) {
    recentChanges.push({
      type: "new_page", path: page.path, title: page.title,
      audience: page.audience, added: page.sections.slice(0, 12),
    });
    continue;
  }
  const oldItems = new Set([...(old.sections || []), ...(old.actions || [])]);
  const added = [...new Set([...(page.sections || []), ...(page.actions || [])])]
    .filter((item) => !oldItems.has(item)).slice(0, 16);
  if (fingerprint(old) !== fingerprint(page)) {
    recentChanges.push({
      type: "updated_page", path: page.path, title: page.title,
      audience: page.audience, added,
    });
  }
}
const sourceCommit = git(["rev-parse", "HEAD"]);
const index = {
  schema_version: "1.0",
  generated_at: git(["show", "-s", "--format=%cI", "HEAD"]),
  source_commit: sourceCommit,
  discovery_method: "automated_visible_ui_metadata",
  boundaries: {
    includes: "Visible page titles, headings, labels, buttons, summaries and same-site navigation labels.",
    excludes: "Scripts, styles, comments, hidden markup, form values, database contents, student records, credentials, payment data, secrets and server implementation.",
  },
  pages,
  recent_changes: recentChanges.slice(0, 20),
};
if (!pages.length) throw new Error("No approved user-facing DCDS pages were discovered.");
if (JSON.stringify(index).length > 120000) throw new Error("Feature index exceeded the 120 KB safety limit.");
writeFileSync(OUTPUT, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log("Generated " + OUTPUT + " from " + pages.length + " approved user-facing pages.");
console.log("Detected " + index.recent_changes.length + " new or updated page(s).");
console.log("Source commit: " + sourceCommit);
