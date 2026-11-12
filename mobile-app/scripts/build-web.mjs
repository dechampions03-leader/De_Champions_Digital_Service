import { cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(mobileDirectory, "..");
const outputDirectory = path.join(mobileDirectory, "www");

// This allowlist deliberately includes only public DCDS web pages and assets.
// Supabase functions, migrations, admin secrets, and repository configuration
// are never copied into the mobile application's web bundle.
const publicFiles = [
  "index.html",
  "student-dashboard.html",
  "student-management.html",
  "admin-account-deletions.html",
  "privacy-policy.html",
  "delete-account.html",
  "admin-notifications.html",
  "admin-assessments.html",
  "assessments.html",
  "learn.html",
  "general-course.html",
  "ai-learning-assistant.html",
  "payment-return.html",
  "offline.html",
  "manifest-v4.webmanifest",
  "dcds-ai-knowledge-base.json",
  "sw.js"
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const relativePath of publicFiles) {
  const sourcePath = path.join(repositoryRoot, relativePath);
  const destinationPath = path.join(outputDirectory, relativePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });

  if (relativePath.endsWith(".html")) {
    let html = await readFile(sourcePath, "utf8");

    // Keep the website's PWA service worker unchanged, but prevent it from
    // registering inside the local Capacitor WebView (Android uses localhost).
    html = html.replaceAll(
      'location.protocol === "https:"',
      'location.protocol === "https:" && location.hostname !== "localhost"'
    );

    // Reuse the existing DCDS launch screen in index.html. It already animates
    // the icon, two-line brand name, tagline and footer before revealing the
    // homepage. Only extend its activation gate in the native bundle so a
    // Capacitor app receives the same intro as an installed standalone PWA.
    // No second splash layer is added and the public website source is untouched.
    if (relativePath === "index.html") {
      const bootstrapPattern = /<script id="dcds-launch-bootstrap">[\\s\\S]*?<\\/script>/;
      const bootstrapMarkup = `<script id="dcds-launch-bootstrap">
(() => {
  try {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    const nativePlatform = window.Capacitor?.isNativePlatform?.() === true
      || (location.hostname === "localhost" && location.protocol !== "https:");
    if (standalone || nativePlatform) {
      document.documentElement.classList.add("dcds-app-loading");
      window.__dcdsLaunchStartedAt = Date.now();
    }
  } catch (_) {}
})();
</script>`;
      if (!bootstrapPattern.test(html)) {
        throw new Error("index.html is missing the existing DCDS launch bootstrap.");
      }
      html = html.replace(bootstrapPattern, bootstrapMarkup);
    }

    await writeFile(destinationPath, html, "utf8");
  } else {
    await copyFile(sourcePath, destinationPath);
  }
}

await cp(
  path.join(repositoryRoot, "assets"),
  path.join(outputDirectory, "assets"),
  { recursive: true }
);

console.log(`DCDS mobile web bundle prepared at: ${path.relative(repositoryRoot, outputDirectory)}`);
console.log(`Copied ${publicFiles.length} approved public files and the assets directory.`);
