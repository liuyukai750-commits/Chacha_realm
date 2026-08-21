import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const files = {
  nextConfig: "next.config.ts",
  env: "deploy/tencent/env/chacha-street.env.example",
  nginxBootstrap: "deploy/tencent/nginx/chacha-street-bootstrap.conf",
  nginxHttps: "deploy/tencent/nginx/chacha-street-https.conf.example",
  service: "deploy/tencent/systemd/chacha-street.service",
  preparer: "scripts/deploy/prepare-standalone.mjs",
  builder: "scripts/deploy/build-standalone.ps1",
  preflight: "scripts/deploy/preflight-tencent.sh",
  installer: "scripts/deploy/install-release.sh",
  docs: "docs/deployment/TENCENT_LIGHTHOUSE.md",
};

const contents = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(resolve(root, path), "utf8")])),
);

const checks = [
  [
    contents.nextConfig.includes('process.env.VERCEL ? undefined : "standalone"'),
    "next.config.ts enables standalone output only outside Vercel",
  ],
  [contents.service.includes("User=chacha"), "systemd service runs as a dedicated user"],
  [contents.service.includes("HOSTNAME=127.0.0.1"), "Next.js binds only to loopback"],
  [contents.service.includes("MemoryMax=1500M"), "2 GiB memory limit is present"],
  [contents.nginxBootstrap.includes("proxy_pass http://chacha_street_next"), "nginx proxies to Next.js"],
  [contents.nginxHttps.includes("ssl_protocols TLSv1.2 TLSv1.3"), "TLS policy is present"],
  [contents.installer.includes("sha256sum --check"), "release checksum is verified"],
  [contents.installer.includes("rolling back"), "failed release rolls back"],
  [contents.preflight.includes("No files or cloud resources were changed"), "preflight declares read-only behavior"],
  [contents.docs.includes("Vercel preview"), "Vercel preview compatibility is documented"],
];

const unsafePatterns = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

for (const [passed, message] of checks) {
  if (!passed) throw new Error(`Deployment asset check failed: ${message}`);
  console.log(`OK ${message}`);
}

const trackedText = Object.values(contents).join("\n");
const secretKeys = new Set([
  "SUPABASE_SECRET_KEY",
  "TENCENTCLOUD_SECRET_KEY",
  "CHACHA_AUTH_HMAC_SECRET",
  "CHACHA_READ_TOKEN_SECRET",
  "CHACHA_PRESENCE_TOKEN_SECRET",
]);
for (const line of contents.env.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match || !secretKeys.has(match[1])) continue;
  const value = match[2].trim();
  if (value !== "" && !value.startsWith("REPLACE_")) {
    throw new Error(`Deployment environment template contains a populated secret: ${match[1]}`);
  }
}
for (const pattern of unsafePatterns) {
  if (pattern.test(trackedText)) {
    throw new Error(`Deployment assets appear to contain a secret or real IPv4 address: ${pattern}`);
  }
}

const ipv4Addresses = trackedText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
const unexpectedIpv4 = [...new Set(ipv4Addresses)].filter((address) => address !== "127.0.0.1");
if (unexpectedIpv4.length > 0) {
  throw new Error(`Deployment assets contain a non-loopback IPv4 address: ${unexpectedIpv4.join(", ")}`);
}

console.log("OK deployment assets contain no detected secrets or real IPv4 addresses");
