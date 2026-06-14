# EIP-8244 Onchain HTML POC

A proof of concept for serving HTML from an EVM smart contract, based on the proposed [EIP-8244: Contract-Hosted Application HTML](https://ethereum-magicians.org/t/erc-8244-contract-hosted-application-html/28407) standard.

The contract exposes a single `html()` view function that returns a self-decompressing HTML document. The actual page content lives in `html/index.html`, is minified and gzip-compressed at build time, stored on-chain as contract bytecode, and inflated in the browser via `DecompressionStream("gzip")`.

Deployments use [Hardhat Ignition](https://hardhat.org/ignition/docs/getting-started), Hardhat's declarative deployment system.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or later (Node 24 recommended)
- npm

## Setup

```bash
npm install
```

## Quick start

You need two terminals: one for the local chain, one for the web server.

**Terminal 1 — start a local Hardhat node:**

```bash
npm run node
```

This starts a JSON-RPC server at `http://127.0.0.1:8545`.

**Terminal 2 — build, deploy, and serve:**

```bash
npm run update
RPC_URL=http://127.0.0.1:8545 npm run serve
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the "Hello, onchain world" page served from the contract.

## Iterating on the HTML

1. Edit `html/index.html`.
2. Run `npm run update` (regenerates the contract, compiles, and deploys via Ignition).
3. Refresh the browser.

Each `update` deploys a new contract instance. The server auto-resolves the address from Ignition's deployment journal.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build:html` | Minify, gzip, base64 encode; regenerate `HelloWorldFrontend.sol` |
| `npm run deploy:local` | Build + compile + Ignition deploy to localhost |
| `npm run deploy:sepolia` | Build + production compile + Ignition deploy to Sepolia |
| `npm run update` | Alias for `deploy:local` (local dev loop) |
| `npm run serve` | HTTP server reading `html()` from chain |
| `npm run node` | Start local Hardhat node on port 8545 |
| `npm run test` | Run the test suite |

## Deploying with Hardhat Ignition

### Pre-deploy step (required)

`contracts/HelloWorldFrontend.sol` is **generated** from `html/index.html`. The `deploy:local` and `deploy:sepolia` scripts run `build:html` automatically, but if you compile or deploy manually, run `npm run build:html` first.

### Local deployment

With `npm run node` running in another terminal:

```bash
npm run deploy:local
```

### Sepolia testnet

Set your Sepolia credentials via the Hardhat keystore:

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

The deployer account must be funded with Sepolia ETH. Then deploy:

```bash
npm run deploy:sepolia
```

This uses the `production` Solidity profile (optimizer enabled) to reduce bytecode size and gas cost.

### Finding the deployed address

Ignition prints the address on success and persists it at:

```
ignition/deployments/chain-<chainId>/deployed_addresses.json
```

Look up the key `HelloWorldFrontendModule#HelloWorldFrontend`. Common chain IDs:

| Network | Chain ID |
|---------|----------|
| localhost (`hardhat node`) | `31337` |
| Sepolia | `11155111` |

Check deployment status (deployment ID is `chain-<chainId>`):

```bash
npx hardhat ignition status chain-31337 --network localhost
```

### Serving from a deployed network

`npm run serve` resolves the contract address automatically from the Ignition journal for the chain behind `RPC_URL`:

```bash
# Local
RPC_URL=http://127.0.0.1:8545 npm run serve

# Sepolia (after npm run deploy:sepolia)
RPC_URL=<your-sepolia-rpc> npm run serve
```

Override the address explicitly if needed:

```bash
RPC_URL=<rpc-url> CONTRACT_ADDRESS=0x... npm run serve
```

### Adding mainnet later

Add a `mainnet` network block to `hardhat.config.ts` with `MAINNET_RPC_URL` and `MAINNET_PRIVATE_KEY` config variables, then add a `deploy:mainnet` npm script following the `deploy:sepolia` pattern.

## Environment variables

### Serve (`scripts/serve.ts`)

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | *(required)* | JSON-RPC endpoint |
| `CONTRACT_ADDRESS` | from Ignition journal | Contract to read `html()` from |
| `PORT` | `3000` | HTTP listen port |

Example with a custom port:

```bash
RPC_URL=http://127.0.0.1:8545 PORT=4173 npm run serve
```

## Project layout

```
html/index.html                        Raw HTML source (edit this)
contracts/HelloWorldFrontend.sol       Generated contract (do not edit by hand)
ignition/modules/HelloWorldFrontend.ts Ignition deployment module
ignition/deployments/                  Ignition deployment journal (gitignored)
scripts/build.ts                       Compress HTML and codegen the contract
scripts/serve.ts                       Local server that reads html() from chain
test/HelloWorldFrontend.ts             Roundtrip test for the onchain payload
```

## How it works

1. **Build** — `scripts/build.ts` reads `html/index.html`, minifies it, gzips it (level 9), base64-encodes the result, and writes `contracts/HelloWorldFrontend.sol` with the payload baked into the constructor.

2. **On-chain storage** — At deploy time, the constructor stores the base64 string as the runtime code of a separate data contract (SSTORE2-style). This keeps the main contract small while the payload can be read back via `extcodecopy`.

3. **`html()`** — Returns a tiny bootstrap document containing the base64 payload and a script that uses the browser's `DecompressionStream("gzip")` to inflate and render the full page.

4. **Serve** — The local server calls `html()` over RPC and returns the bootstrap document. The browser does the decompression.

The build script prints a compression report and warns if the payload exceeds the 24 KB EIP-170 data-contract limit.

## Tests

```bash
npm run test
```

The `HelloWorldFrontend` tests deploy the contract, call `html()`, extract the embedded base64 payload, gunzip it, and verify it matches the source HTML.

To run only those tests:

```bash
npx hardhat test test/HelloWorldFrontend.ts
```

## ERC-5219 compatibility

The contract also implements a minimal [ERC-5219](https://eips.ethereum.org/EIPS/eip-5219) `request()` interface and `resolveMode()` returning `"5219"`, so it can be served by ERC-4804 `web3://` clients in addition to the local server.
