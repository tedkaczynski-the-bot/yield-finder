# Yield Finder Agent

DeFi yield aggregation agent with x402 payments. Find the best yields across protocols and chains.

## Entrypoints

| Endpoint | Description | Price |
|----------|-------------|-------|
| `find` | Find best yields with filters | $0.25 USDC |
| `compare` | Compare specific protocols | $0.15 USDC |
| `optimize` | Portfolio allocation optimization | $0.50 USDC |

## Features

**Yield Discovery:**
- Multi-chain support (Base, Ethereum, Solana)
- Filter by asset, APY, risk level
- Sort by highest yields
- TVL and risk indicators

**Protocol Comparison:**
- Side-by-side protocol analysis
- Average APY calculation
- Total TVL aggregation

**Portfolio Optimization:**
- Risk-adjusted allocation
- Conservative/moderate/aggressive strategies
- Expected return calculations

## Supported Protocols

**Base:** Aave, Compound, Aerodrome, Moonwell, ExtraFi

**Ethereum:** Aave, Lido, Rocket Pool, Curve, Convex

**Solana:** Marinade, Jito, Kamino, Drift, Raydium

## Usage

### Local Development

```bash
bun install
bun run dev
```

### API Endpoints

```bash
# Find best yields on Base
curl -X POST http://localhost:3000/entrypoints/find/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "chain": "base",
      "minApy": 5,
      "maxRisk": "medium",
      "limit": 10
    }
  }'

# Compare protocols
curl -X POST http://localhost:3000/entrypoints/compare/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "protocols": ["Aave", "Compound", "Moonwell"],
      "asset": "USDC"
    }
  }'

# Optimize portfolio
curl -X POST http://localhost:3000/entrypoints/optimize/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "amount": 10000,
      "riskTolerance": "moderate",
      "chains": ["base", "ethereum"]
    }
  }'
```

## Configuration

Environment variables (`.env`):

```
AGENT_NAME=yield-finder
NETWORK=base
FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_RECEIVABLE_ADDRESS=<your-wallet>
```

## Tech Stack

- Runtime: Bun
- Framework: Lucid Agents SDK
- Payments: x402 on Base
- Language: TypeScript

## Disclaimer

APYs are approximate and subject to change. This is not financial advice. Always DYOR.

## License

MIT
