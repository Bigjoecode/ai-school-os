// Writes /.well-known/assetlinks.json (Digital Asset Links) so the Play Store app — a Trusted Web
// Activity — can open the portal full screen, without Chrome's address bar.
//
//   ANDROID_PACKAGE_NAME=com.mejortechworld.aischool \
//   ANDROID_SHA256_FINGERPRINTS="AA:BB:...,CC:DD:..." \
//   node infrastructure/deploy/assetlinks.mjs apps/web/dist/.well-known/assetlinks.json
//
// ANDROID_SHA256_FINGERPRINTS lists every certificate that signs the app, comma-separated:
//   1. the upload key (what Bubblewrap signs with — for sideloaded test builds), and
//   2. Google Play App Signing's "App signing key certificate" (Play Console → Test and release →
//      App integrity), which signs what people download from Play. Add it after the first upload.
// Neither is secret: they are public certificate fingerprints, kept as GitHub repository
// *variables* (not secrets). With none set, nothing is written and the deploy carries on.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('usage: assetlinks.mjs <output path>');
  process.exit(2);
}

const packageName = (process.env.ANDROID_PACKAGE_NAME ?? '').trim();
const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? '')
  .split(/[\s,]+/)
  .map((f) => f.trim().toUpperCase())
  .filter(Boolean);

if (!packageName || fingerprints.length === 0) {
  console.log('Android app links: ANDROID_PACKAGE_NAME / ANDROID_SHA256_FINGERPRINTS not set — skipping assetlinks.json');
  process.exit(0);
}
if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(packageName)) {
  console.error(`ANDROID_PACKAGE_NAME is not a valid Android package name: ${packageName}`);
  process.exit(1);
}
const bad = fingerprints.filter((f) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
if (bad.length) {
  console.error(`Not SHA-256 certificate fingerprints (expected 32 hex pairs separated by colons): ${bad.join(', ')}`);
  process.exit(1);
}

const statements = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [...new Set(fingerprints)] },
  },
];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(statements, null, 2) + '\n');
console.log(`Android app links: wrote ${out} for ${packageName} (${fingerprints.length} fingerprint${fingerprints.length === 1 ? '' : 's'})`);
