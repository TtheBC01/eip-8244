/**
 * serve.ts — local server for the EIP-8244 onchain HTML POC.
 *
 * Reads the contract's html() over an RPC endpoint and serves the returned
 * (self-decompressing) document to the browser, which inflates the gzip payload
 * via DecompressionStream. The document is re-read from chain on every request.
 *
 * Env:
 *   RPC_URL           JSON-RPC endpoint (required).
 *   CONTRACT_ADDRESS  Contract address. Falls back to Ignition deployment journal.
 *   PORT              Listen port. Default 3000.
 *
 * Run: RPC_URL=http://127.0.0.1:8545 node scripts/serve.ts
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, type Address } from "viem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IGNITION_DEPLOYMENTS = join(ROOT, "ignition", "deployments");
const IGNITION_CONTRACT_KEY = "HelloWorldFrontendModule#HelloWorldFrontend";

const HTML_ABI = [
  {
    type: "function",
    name: "html",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

function readIgnitionAddress(chainId: number): Address | undefined {
  const path = join(IGNITION_DEPLOYMENTS, `chain-${chainId}`, "deployed_addresses.json");
  try {
    const deployed = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    const address = deployed[IGNITION_CONTRACT_KEY];
    return address ? (address as Address) : undefined;
  } catch {
    return undefined;
  }
}

async function resolveConfig(): Promise<{ rpcUrl: string; address: Address }> {
  const rpcUrl = process.env.RPC_URL;
  let address = process.env.CONTRACT_ADDRESS as Address | undefined;

  if (!rpcUrl) {
    console.error("RPC_URL is required.");
    process.exit(1);
  }

  if (!address) {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const chainId = Number(await client.getChainId());
    address = readIgnitionAddress(chainId);
  }

  if (!address) {
    console.error(
      "Contract address is required. Set CONTRACT_ADDRESS or run " +
        "npm run deploy:local (or deploy:sepolia) first.",
    );
    process.exit(1);
  }

  return { rpcUrl, address };
}

const { rpcUrl, address } = await resolveConfig();
const PORT = Number(process.env.PORT ?? 3000);

const client = createPublicClient({ transport: http(rpcUrl) });

const server = createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
    return;
  }
  if (req.url !== "/" && req.url !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  try {
    const html = await client.readContract({
      address,
      abi: HTML_ABI,
      functionName: "html",
    });
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(html);
  } catch (err) {
    console.error("Failed to read html() from contract:", err);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Failed to read html() from contract. Is the node running and the contract deployed?");
  }
});

server.listen(PORT, () => {
  console.log(`EIP-8244 server listening on http://localhost:${PORT}`);
  console.log(`  rpc      ${rpcUrl}`);
  console.log(`  contract ${address}`);
});
