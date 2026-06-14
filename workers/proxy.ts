/**
 * Cloudflare Worker proxy for the EIP-8244 onchain HTML POC.
 *
 * Reads the contract's html() over JSON-RPC and serves the returned
 * (self-decompressing) document to the browser on every request.
 */

const HTML_SELECTOR = "0x33c34ac3"; // keccak256("html()")[:4]

export interface Env {
  RPC_URL: string;
  CONTRACT_ADDRESS: string;
}

interface JsonRpcResponse {
  result?: string;
  error?: { message: string };
}

function decodeAbiString(hex: string): string {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  const offset = Number.parseInt(data.slice(0, 64), 16) * 2;
  const length = Number.parseInt(data.slice(offset, offset + 64), 16);
  const strHex = data.slice(offset + 64, offset + 64 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number.parseInt(strHex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

async function readHtml(rpcUrl: string, address: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: address, data: HTML_SELECTOR }, "latest"],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }

  const json = (await response.json()) as JsonRpcResponse;
  if (json.error) {
    throw new Error(json.error.message);
  }
  if (!json.result) {
    throw new Error("RPC response missing result");
  }

  return decodeAbiString(json.result);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.RPC_URL || !env.CONTRACT_ADDRESS) {
      return new Response(
        "Worker is missing RPC_URL or CONTRACT_ADDRESS configuration.",
        { status: 500 },
      );
    }

    try {
      const html = await readHtml(env.RPC_URL, env.CONTRACT_ADDRESS);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    } catch (err) {
      console.error("Failed to read html() from contract:", err);
      return new Response(
        "Failed to read html() from contract. Check RPC_URL and CONTRACT_ADDRESS.",
        { status: 502 },
      );
    }
  },
};
