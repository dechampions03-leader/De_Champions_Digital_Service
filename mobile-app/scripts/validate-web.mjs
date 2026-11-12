import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(mobileDirectory, "www");

const requiredPages = [
  "index.html",
  "student-dashboard.html",
  "student-management.html",
  "admin-notifications.html",
  "admin-assessments.html",
  "assessments.html",
  "learn.html",
  "general-course.html",
  "ai-learning-assistant.html",
  "payment-return.html",
  "offline.html"
];

const config = JSON.parse(
  await readFile(path.join(mobileDirectory, "capacitor.config.json"), "utf8")
);
const packageJson = JSON.parse(
  await readFile(path.join(mobileDirectory, "package.json"), "utf8")
);

assert.match(config.appId, /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/, "Capacitor appId must be a valid reverse-domain identifier");
assert.equal(config.appName, "De Champions Digital Service", "Unexpected DCDS app name");
assert.equal(config.webDir, "www", "Capacitor webDir must point to the generated www directory");
assert.ok(packageJson.dependencies["@capacitor/core"], "Capacitor core dependency is missing");
assert.ok(packageJson.dependencies["@capacitor/android"], "Android platform dependency is missing");
assert.ok(packageJson.dependencies["@capacitor/ios"], "iOS platform dependency is missing");
assert.ok(Number.parseInt(process.versions.node.split(".")[0], 10) >= 22, "Capacitor 8 requires Node.js 22 or later");

for (const page of requiredPages) {
  await access(path.join(outputDirectory, page));
  const html = await readFile(path.join(outputDirectory, page), "utf8");
  assert.match(html, /<head[\s>]/i, `${page} must contain a head element`);
  assert.match(html, /<body[\s>]/i, `${page} must contain a body element`);

  if (html.includes('navigator.serviceWorker.register("./sw.js")')) {
    assert.ok(
      html.includes('location.hostname !== "localhost"'),
      `${page} must not register the website service worker inside the native WebView`
    );
  }
}

const manifest = JSON.parse(
  await readFile(path.join(outputDirectory, "manifest-v4.webmanifest"), "utf8")
);
assert.equal(manifest.name, "De Champions Digital Service");
assert.equal(manifest.display, "standalone");
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "PWA manifest must declare app icons");

function getPngDimensions(buffer, filename) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(buffer.subarray(0, 8).equals(pngSignature), `${filename} is not a PNG image`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const expectedSize of [192, 512]) {
  const icon = manifest.icons.find(item => item.sizes === `${expectedSize}x${expectedSize}`);
  assert.ok(icon, `Manifest is missing its ${expectedSize}px icon`);
  const iconPath = path.resolve(outputDirectory, icon.src.replace(/^\.\//, ""));
  const dimensions = getPngDimensions(await readFile(iconPath), icon.src);
  assert.deepEqual(dimensions, { width: expectedSize, height: expectedSize }, `${icon.src} has unexpected dimensions`);
}

await access(path.join(outputDirectory, "dcds-ai-knowledge-base.json"));
await access(path.join(outputDirectory, "assets", "dcds-splash-icon-v4-192.png"));
await access(path.join(outputDirectory, "assets", "dcds-splash-icon-v4-512.png"));

const htmlFiles = await Promise.all(
  requiredPages.map(page => readFile(path.join(outputDirectory, page), "utf8"))
);
const combinedHtml = htmlFiles.join("\n");
const remoteSupabaseCdnReferences = (combinedHtml.match(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/g) || []).length;

console.log(`PASS: ${requiredPages.length} DCDS pages are present and structurally valid.`);
console.log("PASS: Capacitor identity, app configuration, Node engine and platform dependencies are present.");
console.log("PASS: Existing PWA manifest and 192px/512px icons are valid.");
console.log("PASS: Native bundle excludes service-worker registration on localhost.");
console.log(`INFO: ${remoteSupabaseCdnReferences} page(s) reference the Supabase CDN; native account/payment flows require internet access and device testing.`);
console.log("NOTE: This validates the web bundle only. It does not compile or sign Android/iOS binaries.");
