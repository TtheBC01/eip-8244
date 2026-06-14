/**
 * deploy-worker.ts — deploy the EIP-8244 onchain HTML proxy to Cloudflare Workers.
 *
 * Reads the contract's html() over JSON-RPC and serves it at the Worker's URL,
 * mirroring scripts/serve.ts for edge deployment.
 *
 * Env (required):
 *   RPC_URL           JSON-RPC endpoint (uploaded as a Worker secret).
 *   CONTRACT_ADDRESS  Contract address (injected as a Worker var).
 *
 * Prerequisites:
 *   npx wrangler login
 *
 * Run:
 *   RPC_URL=https://... CONTRACT_ADDRESS=0x... npm run deploy:worker
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function runWrangler(args: string[]): void {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required.`);
    console.error("");
    console.error("Example:");
    console.error(
      "  RPC_URL=https://sepolia.example.com CONTRACT_ADDRESS=0x... npm run deploy:worker",
    );
    process.exit(1);
  }
  return value;
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

const rpcUrl = requireEnv("RPC_URL");
const contractAddress = requireEnv("CONTRACT_ADDRESS");

if (!isAddress(contractAddress)) {
  console.error("CONTRACT_ADDRESS must be a 0x-prefixed 20-byte hex address.");
  process.exit(1);
}

const secretsDir = mkdtempSync(join(tmpdir(), "eip-8244-worker-secrets-"));
const secretsFile = join(secretsDir, "secrets.json");

try {
  writeFileSync(
    secretsFile,
    JSON.stringify({ RPC_URL: rpcUrl }),
    { mode: 0o600 },
  );

  console.log("Deploying EIP-8244 proxy Worker...");
  console.log(`  contract ${contractAddress}`);
  console.log("  rpc      (stored as secret)");

  runWrangler([
    "deploy",
    "--var",
    `CONTRACT_ADDRESS:${contractAddress}`,
    "--secrets-file",
    secretsFile,
  ]);
} finally {
  rmSync(secretsDir, { recursive: true, force: true });
}
