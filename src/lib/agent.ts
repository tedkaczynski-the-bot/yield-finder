import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "yield-finder",
  version: process.env.AGENT_VERSION ?? "0.1.0",
  description: process.env.AGENT_DESCRIPTION ?? "Find the best DeFi yields across protocols",
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// Mock yield data (in production, this would fetch from DeFi APIs)
const YIELD_SOURCES = {
  base: [
    { protocol: "Aave", asset: "USDC", apy: 4.2, tvl: "1.2B", risk: "low" },
    { protocol: "Aave", asset: "ETH", apy: 2.1, tvl: "800M", risk: "low" },
    { protocol: "Compound", asset: "USDC", apy: 3.8, tvl: "500M", risk: "low" },
    { protocol: "Aerodrome", asset: "USDC-ETH LP", apy: 18.5, tvl: "200M", risk: "medium" },
    { protocol: "Moonwell", asset: "USDC", apy: 5.1, tvl: "150M", risk: "low" },
    { protocol: "ExtraFi", asset: "USDC", apy: 8.2, tvl: "50M", risk: "medium" },
  ],
  ethereum: [
    { protocol: "Aave", asset: "USDC", apy: 3.5, tvl: "5B", risk: "low" },
    { protocol: "Aave", asset: "ETH", apy: 1.8, tvl: "3B", risk: "low" },
    { protocol: "Lido", asset: "stETH", apy: 3.2, tvl: "15B", risk: "low" },
    { protocol: "Rocket Pool", asset: "rETH", apy: 3.0, tvl: "2B", risk: "low" },
    { protocol: "Curve", asset: "3pool", apy: 2.5, tvl: "1B", risk: "low" },
    { protocol: "Convex", asset: "cvxCRV", apy: 12.5, tvl: "500M", risk: "medium" },
  ],
  solana: [
    { protocol: "Marinade", asset: "mSOL", apy: 6.5, tvl: "1.5B", risk: "low" },
    { protocol: "Jito", asset: "JitoSOL", apy: 7.2, tvl: "800M", risk: "low" },
    { protocol: "Kamino", asset: "USDC", apy: 8.5, tvl: "300M", risk: "medium" },
    { protocol: "Drift", asset: "USDC", apy: 10.2, tvl: "150M", risk: "medium" },
    { protocol: "Raydium", asset: "SOL-USDC LP", apy: 25.0, tvl: "100M", risk: "high" },
  ],
};

// Find best yields input schema
const findSchema = z.object({
  chain: z.enum(["base", "ethereum", "solana", "all"]).default("all"),
  asset: z.string().optional(),
  minApy: z.number().min(0).optional(),
  maxRisk: z.enum(["low", "medium", "high"]).optional(),
  limit: z.number().min(1).max(20).default(10),
});

// Compare protocols input schema
const compareSchema = z.object({
  protocols: z.array(z.string()).min(2).max(5),
  asset: z.string().optional(),
});

// Portfolio optimization input schema
const optimizeSchema = z.object({
  amount: z.number().min(100),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
  chains: z.array(z.enum(["base", "ethereum", "solana"])).default(["base"]),
});

// Find best yields entrypoint
addEntrypoint({
  key: "find",
  description: "Find the best DeFi yields across protocols and chains",
  input: findSchema,
  price: { amount: "0.25", currency: "USDC" },
  handler: async (ctx) => {
    const { chain, asset, minApy, maxRisk, limit } = ctx.input as z.infer<typeof findSchema>;
    
    let yields: Array<typeof YIELD_SOURCES.base[0] & { chain: string }> = [];
    
    // Collect yields from requested chains
    const chains = chain === "all" ? ["base", "ethereum", "solana"] : [chain];
    for (const c of chains) {
      const chainYields = YIELD_SOURCES[c as keyof typeof YIELD_SOURCES] || [];
      yields.push(...chainYields.map(y => ({ ...y, chain: c })));
    }
    
    // Apply filters
    if (asset) {
      yields = yields.filter(y => 
        y.asset.toLowerCase().includes(asset.toLowerCase())
      );
    }
    if (minApy !== undefined) {
      yields = yields.filter(y => y.apy >= minApy);
    }
    if (maxRisk) {
      const riskLevels = { low: 1, medium: 2, high: 3 };
      const maxLevel = riskLevels[maxRisk];
      yields = yields.filter(y => riskLevels[y.risk as keyof typeof riskLevels] <= maxLevel);
    }
    
    // Sort by APY descending
    yields.sort((a, b) => b.apy - a.apy);
    
    // Limit results
    yields = yields.slice(0, limit);
    
    return {
      output: {
        yields,
        count: yields.length,
        bestYield: yields[0] || null,
        averageApy: yields.length > 0 
          ? (yields.reduce((sum, y) => sum + y.apy, 0) / yields.length).toFixed(2)
          : "0",
        timestamp: new Date().toISOString(),
        disclaimer: "APYs are approximate and subject to change. Always DYOR.",
      },
    };
  },
});

// Compare protocols entrypoint
addEntrypoint({
  key: "compare",
  description: "Compare yields across specific protocols",
  input: compareSchema,
  price: { amount: "0.15", currency: "USDC" },
  handler: async (ctx) => {
    const { protocols, asset } = ctx.input as z.infer<typeof compareSchema>;
    
    const allYields = [
      ...YIELD_SOURCES.base.map(y => ({ ...y, chain: "base" })),
      ...YIELD_SOURCES.ethereum.map(y => ({ ...y, chain: "ethereum" })),
      ...YIELD_SOURCES.solana.map(y => ({ ...y, chain: "solana" })),
    ];
    
    const comparison: Record<string, typeof allYields> = {};
    
    for (const protocol of protocols) {
      let protocolYields = allYields.filter(y => 
        y.protocol.toLowerCase() === protocol.toLowerCase()
      );
      if (asset) {
        protocolYields = protocolYields.filter(y =>
          y.asset.toLowerCase().includes(asset.toLowerCase())
        );
      }
      comparison[protocol] = protocolYields;
    }
    
    // Calculate summary stats
    const summary = protocols.map(protocol => {
      const yields = comparison[protocol] || [];
      const avgApy = yields.length > 0
        ? yields.reduce((sum, y) => sum + y.apy, 0) / yields.length
        : 0;
      const totalTvl = yields.reduce((sum, y) => {
        const tvlNum = parseFloat(y.tvl.replace(/[^0-9.]/g, ""));
        const multiplier = y.tvl.includes("B") ? 1e9 : y.tvl.includes("M") ? 1e6 : 1;
        return sum + tvlNum * multiplier;
      }, 0);
      return {
        protocol,
        avgApy: avgApy.toFixed(2),
        poolCount: yields.length,
        totalTvl: totalTvl > 1e9 ? `${(totalTvl / 1e9).toFixed(1)}B` : `${(totalTvl / 1e6).toFixed(0)}M`,
      };
    });
    
    return {
      output: {
        comparison,
        summary,
        winner: summary.sort((a, b) => parseFloat(b.avgApy) - parseFloat(a.avgApy))[0]?.protocol || null,
      },
    };
  },
});

// Portfolio optimization entrypoint
addEntrypoint({
  key: "optimize",
  description: "Get optimized yield allocation for your portfolio",
  input: optimizeSchema,
  price: { amount: "0.50", currency: "USDC" },
  handler: async (ctx) => {
    const { amount, riskTolerance, chains } = ctx.input as z.infer<typeof optimizeSchema>;
    
    // Get yields for requested chains
    let yields: Array<typeof YIELD_SOURCES.base[0] & { chain: string }> = [];
    for (const chain of chains) {
      const chainYields = YIELD_SOURCES[chain as keyof typeof YIELD_SOURCES] || [];
      yields.push(...chainYields.map(y => ({ ...y, chain })));
    }
    
    // Filter by risk tolerance
    const riskFilters = {
      conservative: ["low"],
      moderate: ["low", "medium"],
      aggressive: ["low", "medium", "high"],
    };
    yields = yields.filter(y => riskFilters[riskTolerance].includes(y.risk));
    
    // Sort by APY
    yields.sort((a, b) => b.apy - a.apy);
    
    // Create allocation
    const allocation: Array<{
      protocol: string;
      asset: string;
      chain: string;
      apy: number;
      amount: number;
      percentage: number;
    }> = [];
    
    // Allocation strategy based on risk tolerance
    const maxPositions = riskTolerance === "conservative" ? 3 : riskTolerance === "moderate" ? 5 : 7;
    const topYields = yields.slice(0, maxPositions);
    
    // Weight by APY
    const totalApy = topYields.reduce((sum, y) => sum + y.apy, 0);
    for (const y of topYields) {
      const percentage = (y.apy / totalApy) * 100;
      allocation.push({
        protocol: y.protocol,
        asset: y.asset,
        chain: y.chain,
        apy: y.apy,
        amount: Math.round((percentage / 100) * amount),
        percentage: Math.round(percentage),
      });
    }
    
    // Calculate expected returns
    const weightedApy = allocation.reduce((sum, a) => sum + (a.apy * a.percentage / 100), 0);
    const expectedYearlyReturn = (amount * weightedApy / 100);
    
    return {
      output: {
        allocation,
        summary: {
          totalAmount: amount,
          positionCount: allocation.length,
          weightedApy: weightedApy.toFixed(2),
          expectedYearlyReturn: expectedYearlyReturn.toFixed(2),
          riskLevel: riskTolerance,
        },
        recommendation: `Based on ${riskTolerance} risk tolerance, diversify across ${allocation.length} positions for optimal risk-adjusted returns.`,
        disclaimer: "This is not financial advice. APYs fluctuate and past performance does not guarantee future results.",
      },
    };
  },
});

export { app };
