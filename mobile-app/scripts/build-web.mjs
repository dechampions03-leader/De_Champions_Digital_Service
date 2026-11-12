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

    // Add the three-part DCDS opening sequence only to the native app bundle:
    // (1) the OS launch screen shows the large icon on white, (2) this intro
    // presents the name/tagline and footer, and (3) it fades into the homepage.
    // The public website remains unchanged and never receives this overlay.
    if (relativePath === "index.html") {
      const launchStyles = `
<style id="dcds-native-launch-screen-styles">
#dcds-native-launch-screen{position:fixed;inset:0;z-index:2147483647;overflow:hidden;background:#fff;color:#311149;opacity:1;visibility:visible;transition:opacity .58s ease,visibility .58s ease;pointer-events:auto}
#dcds-native-launch-screen.is-leaving{opacity:0;visibility:hidden;pointer-events:none}
#dcds-native-launch-screen .dcds-native-launch-main{position:absolute;top:32.5%;left:0;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;transform:translateY(0);padding-inline:16px}
#dcds-native-launch-screen .dcds-native-launch-icon{display:block;width:min(37vw,148px);height:auto;aspect-ratio:1;object-fit:contain;margin:0 auto}
#dcds-native-launch-screen .dcds-native-launch-name{margin:24px 0 0;color:#311149;font:800 15px/1.35 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase}
#dcds-native-launch-screen .dcds-native-launch-service{margin:7px 0 0;color:#795095;font:500 17px/1.35 Arial,sans-serif;letter-spacing:.17em;text-transform:uppercase}
#dcds-native-launch-screen .dcds-native-launch-tagline{margin:25px 0 0;color:#795095;font:700 9px/1.4 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap}
#dcds-native-launch-screen .dcds-native-launch-footer{position:absolute;left:28px;right:28px;bottom:calc(env(safe-area-inset-bottom,0px) + 4.2vh);padding-top:25px;border-top:1px solid #eee8f3;text-align:center;color:#321744;font:700 18px/1.35 Georgia,serif}
@media(max-width:360px){#dcds-native-launch-screen .dcds-native-launch-name{font-size:13px}#dcds-native-launch-screen .dcds-native-launch-service{font-size:15px}#dcds-native-launch-screen .dcds-native-launch-tagline{font-size:8px;letter-spacing:.08em}#dcds-native-launch-screen .dcds-native-launch-footer{font-size:16px}}
@media(prefers-reduced-motion:reduce){#dcds-native-launch-screen{transition:none}}
</style>`;
      const launchMarkup = `
<div id="dcds-native-launch-screen" role="status" aria-label="De Champions Digital Service">
  <div class="dcds-native-launch-main">
    <img class="dcds-native-launch-icon" src="./assets/dcds-splash-icon-v4-512.png" alt="" />
    <p class="dcds-native-launch-name">DE CHAMPIONS</p>
    <p class="dcds-native-launch-service">DIGITAL SERVICE</p>
    <p class="dcds-native-launch-tagline">CREATE &bull; LEARN &bull; INNOVATE &bull; EARN</p>
  </div>
  <div class="dcds-native-launch-footer">De Champions Digital Service</div>
</div>
<script id="dcds-native-launch-screen-controller">
(() => {
  const splash = document.getElementById("dcds-native-launch-screen");
  if (!splash) return;
  let dismissed = false;
  const dismiss = () => {
    if (dismissed || !splash.isConnected) return;
    dismissed = true;
    splash.classList.add("is-leaving");
    window.setTimeout(() => splash.remove(), 650);
  };
  const afterReady = () => window.setTimeout(dismiss, 1350);
  if (document.readyState === "complete") afterReady();
  else window.addEventListener("load", afterReady, { once: true });
  // A bounded fallback prevents a stalled third-party request from trapping
  // the learner behind the launch screen indefinitely.
  window.setTimeout(dismiss, 6500);
})();
</script>`;
      if (!html.includes("</head>") || !/<body\b[^>]*>/i.test(html)) {
        throw new Error("Cannot inject the DCDS native opening screen: index.html is missing head/body.");
      }
      html = html.replace("</head>", launchStyles + "\n</head>");
      html = html.replace(/<body\b[^>]*>/i, (openingBody) => openingBody + launchMarkup);
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
