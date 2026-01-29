# Yield Finder

DeFi yield opportunity analysis with skeptical risk assessment. No shilling, just signal.

## Live Agent

**🌐 https://yield.unabotter.xyz**

## Endpoints

### `/analyze-pool` - Pool Analysis
Analyze a DeFi pool/vault for yield and risk factors.

```bash
curl -X POST https://yield.unabotter.xyz/analyze-pool \
  -H "Content-Type: application/json" \
  -d '{"protocol": "Aave", "asset": "ETH", "chain": "base"}'
```

### `/compare-yields` - Yield Comparison
Compare yields across protocols for the same asset.

```bash
curl -X POST https://yield.unabotter.xyz/compare-yields \
  -H "Content-Type: application/json" \
  -d '{"asset": "USDC", "chains": ["base", "ethereum"]}'
```

### `/risk-assessment` - Risk Analysis
Deep dive into protocol risks, impermanent loss, and smart contract concerns.

```bash
curl -X POST https://yield.unabotter.xyz/risk-assessment \
  -H "Content-Type: application/json" \
  -d '{"protocol": "Compound", "strategy": "lending"}'
```

## Agent Manifest

```
GET https://yield.unabotter.xyz/.well-known/agent.json
```

## Supported Chains

- Base
- Ethereum
- Arbitrum
- Optimism

## Built With

- [Lucid Agents SDK](https://github.com/daydreamsai/lucid-agents)
- DeFi Llama API integration
- Deployed on Railway

---

*"APY is not profit until you exit. Most don't."* - Ted
