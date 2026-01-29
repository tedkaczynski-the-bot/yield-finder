console.log('[agent] Starting imports...');
import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";
import { readFileSync } from "fs";
import { join } from "path";
console.log('[agent] Imports done, creating agent...');

// ============================================================================
// PROTOCOL RESEARCH (Brave API)
// ============================================================================

async function searchProtocolAudits(protocol: string): Promise<Array<{title: string; url: string}>> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return [];
  
  try {
    const query = encodeURIComponent(`${protocol} DeFi audit report security`);
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${query}&count=5`, {
      headers: { "X-Subscription-Token": apiKey }
    });
    const data = await response.json() as any;
    return (data.web?.results || []).map((r: any) => ({ title: r.title, url: r.url }));
  } catch {
    return [];
  }
}

async function searchProtocolHacks(protocol: string): Promise<Array<{title: string; url: string}>> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return [];
  
  try {
    const query = encodeURIComponent(`${protocol} hack exploit vulnerability DeFi`);
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${query}&count=5`, {
      headers: { "X-Subscription-Token": apiKey }
    });
    const data = await response.json() as any;
    return (data.web?.results || []).map((r: any) => ({ title: r.title, url: r.url }));
  } catch {
    return [];
  }
}

// ============================================================================
// AI ANALYSIS (OpenRouter)
// ============================================================================

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "";
  
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://unabotter.xyz",
        "X-Title": "Ted Yield Finder"
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 2048,
        temperature: 0.3
      })
    });
    if (!response.ok) return "";
    const data = await response.json() as any;
    return data.choices[0].message.content;
  } catch {
    return "";
  }
}

const YIELD_ANALYST_PROMPT = `You are Ted, a sardonic DeFi analyst. You understand:
- Yield farming mechanics (LP fees, liquidity mining, real yield vs emissions)
- Risk factors (smart contract risk, IL, oracle risk, rug risk)
- Protocol sustainability (real revenue vs token printing)
- Historical DeFi exploits and what to watch for

Be direct about risks. Gambling is fine if you know you're gambling.`;

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "yield-finder",
  version: process.env.AGENT_VERSION ?? "1.0.0",
  description: "DeFi yield aggregation with live data. Find yield, but don't pretend you're not gambling.",
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();
console.log('[agent] Agent built successfully');

const { app, addEntrypoint } = await createAgentApp(agent);
console.log('[agent] App created, adding entrypoints...');

// ============================================================================
// DEFILLAMA INTEGRATION
// ============================================================================

interface DefiLlamaPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  rewardTokens: string[] | null;
  pool: string;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  apyPct1D: number | null;
  apyPct7D: number | null;
  apyPct30D: number | null;
  predictions?: {
    predictedClass: string;
    predictedProbability: number;
  };
}

interface YieldPool {
  chain: string;
  protocol: string;
  asset: string;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  tvl: string;
  tvlRaw: number;
  riskLevel: "low" | "medium" | "high";
  riskFactors: string[];
  stablecoin: boolean;
  ilRisk: boolean;
  trend: "up" | "down" | "stable";
  trendChange: number | null;
  tedComment: string;
}

// Chain mapping
const CHAIN_MAP: Record<string, string[]> = {
  base: ["Base"],
  ethereum: ["Ethereum"],
  solana: ["Solana"],
  arbitrum: ["Arbitrum"],
  optimism: ["Optimism"],
  polygon: ["Polygon"],
  avalanche: ["Avalanche"],
  bsc: ["BSC", "Binance"],
};

// Ted's commentary templates
const TED_COMMENTS = {
  highApy: [
    "APY this high usually means you're the yield. Proceed with caution.",
    "Numbers like these are either a goldmine or a rug in progress. Probably the latter.",
    "When yield is too good to be true, you're not the farmer - you're the crop.",
    "This APY is giving 'please provide exit liquidity' energy.",
  ],
  lowRisk: [
    "Boring and reliable. The Honda Civic of DeFi.",
    "Safe enough that you might actually sleep at night.",
    "Conservative choice. Your portfolio won't be exciting, but it'll probably exist tomorrow.",
    "This is what 'sustainable yield' looks like. Not sexy, but real.",
  ],
  mediumRisk: [
    "Middle of the road. Some risk, some reward. Standard DeFi stuff.",
    "Not quite degen, not quite boomer. A balanced position.",
    "Reasonable risk for reasonable returns. How novel.",
  ],
  highRisk: [
    "Full degen mode. May the odds be ever in your favor.",
    "This is the financial equivalent of free soloing. Exciting until it isn't.",
    "High risk, high reward, high chance of becoming a cautionary tale.",
    "Only put in what you can watch go to zero while maintaining inner peace.",
  ],
  stablecoin: [
    "Stablecoin yield - the closest thing to 'safe' in DeFi, which isn't saying much.",
    "At least you're not exposed to price volatility. Just smart contract risk, oracle risk, depegging risk...",
  ],
  ilPool: [
    "LP position with impermanent loss risk. Math will punish you if assets diverge.",
    "Impermanent loss is permanent if you panic sell. Just saying.",
  ],
  trendingUp: [
    "APY trending up. Either more rewards or less TVL. Figure out which.",
  ],
  trendingDown: [
    "APY falling. The early farmers have harvested. You're arriving for the scraps.",
  ],
};

function pickComment(category: keyof typeof TED_COMMENTS): string {
  const comments = TED_COMMENTS[category];
  return comments[Math.floor(Math.random() * comments.length)];
}

function formatTvl(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(2)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(2)}M`;
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(2)}K`;
  return `$${tvl.toFixed(2)}`;
}

function assessRisk(pool: DefiLlamaPool): { level: "low" | "medium" | "high"; factors: string[] } {
  const factors: string[] = [];
  let riskScore = 0;
  
  // TVL risk
  if (pool.tvlUsd < 1_000_000) {
    factors.push("Low TVL (<$1M)");
    riskScore += 3;
  } else if (pool.tvlUsd < 10_000_000) {
    factors.push("Moderate TVL (<$10M)");
    riskScore += 1;
  }
  
  // APY risk - extremely high APY is suspicious
  if (pool.apy > 100) {
    factors.push("Extremely high APY (>100%)");
    riskScore += 3;
  } else if (pool.apy > 50) {
    factors.push("Very high APY (>50%)");
    riskScore += 2;
  } else if (pool.apy > 20) {
    factors.push("High APY (>20%)");
    riskScore += 1;
  }
  
  // IL risk
  if (pool.ilRisk === "yes") {
    factors.push("Impermanent loss exposure");
    riskScore += 1;
  }
  
  // Exposure risk
  if (pool.exposure === "multi") {
    factors.push("Multi-asset exposure");
    riskScore += 1;
  }
  
  // Reward token dependency
  if (pool.apyReward && pool.apyBase) {
    const rewardRatio = pool.apyReward / (pool.apyBase + pool.apyReward);
    if (rewardRatio > 0.8) {
      factors.push("Yield mostly from reward tokens");
      riskScore += 2;
    } else if (rewardRatio > 0.5) {
      factors.push("Significant reward token dependency");
      riskScore += 1;
    }
  }
  
  // Trend risk
  if (pool.apyPct7D && pool.apyPct7D < -20) {
    factors.push("APY dropped >20% in 7 days");
    riskScore += 1;
  }
  
  let level: "low" | "medium" | "high";
  if (riskScore >= 5) level = "high";
  else if (riskScore >= 2) level = "medium";
  else level = "low";
  
  if (factors.length === 0) {
    factors.push("No major risk factors identified");
  }
  
  return { level, factors };
}

function transformPool(pool: DefiLlamaPool): YieldPool {
  const risk = assessRisk(pool);
  
  // Determine trend
  let trend: "up" | "down" | "stable" = "stable";
  let trendChange: number | null = pool.apyPct7D;
  if (pool.apyPct7D) {
    if (pool.apyPct7D > 5) trend = "up";
    else if (pool.apyPct7D < -5) trend = "down";
  }
  
  // Generate Ted comment based on pool characteristics
  let tedComment: string;
  if (pool.apy > 50) {
    tedComment = pickComment("highApy");
  } else if (risk.level === "low") {
    tedComment = pickComment("lowRisk");
  } else if (risk.level === "high") {
    tedComment = pickComment("highRisk");
  } else if (pool.stablecoin) {
    tedComment = pickComment("stablecoin");
  } else if (pool.ilRisk === "yes") {
    tedComment = pickComment("ilPool");
  } else if (trend === "up") {
    tedComment = pickComment("trendingUp");
  } else if (trend === "down") {
    tedComment = pickComment("trendingDown");
  } else {
    tedComment = pickComment("mediumRisk");
  }
  
  return {
    chain: pool.chain,
    protocol: pool.project,
    asset: pool.symbol,
    apy: Math.round(pool.apy * 100) / 100,
    apyBase: pool.apyBase ? Math.round(pool.apyBase * 100) / 100 : null,
    apyReward: pool.apyReward ? Math.round(pool.apyReward * 100) / 100 : null,
    tvl: formatTvl(pool.tvlUsd),
    tvlRaw: pool.tvlUsd,
    riskLevel: risk.level,
    riskFactors: risk.factors,
    stablecoin: pool.stablecoin,
    ilRisk: pool.ilRisk === "yes",
    trend,
    trendChange,
    tedComment,
  };
}

async function fetchYields(): Promise<DefiLlamaPool[]> {
  try {
    const response = await fetch("https://yields.llama.fi/pools");
    if (!response.ok) {
      throw new Error(`DeFiLlama API error: ${response.status}`);
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Failed to fetch yields:", error);
    return [];
  }
}

// ============================================================================
// ENTRYPOINTS
// ============================================================================

const findSchema = z.object({
  chain: z.enum(["base", "ethereum", "solana", "arbitrum", "optimism", "polygon", "avalanche", "bsc", "all"]).default("all"),
  asset: z.string().optional(),
  minApy: z.number().min(0).optional(),
  maxApy: z.number().optional(),
  minTvl: z.number().optional(),
  maxRisk: z.enum(["low", "medium", "high"]).optional(),
  stablecoinOnly: z.boolean().optional(),
  limit: z.number().min(1).max(50).default(20),
});

const compareSchema = z.object({
  protocols: z.array(z.string()).min(2).max(10),
  chain: z.string().optional(),
});

const optimizeSchema = z.object({
  amount: z.number().min(100),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
  chains: z.array(z.string()).default(["ethereum"]),
  stablecoinOnly: z.boolean().optional(),
});

// ============================================================================
// PREMIUM: PROTOCOL DEEP DIVE
// ============================================================================

const protocolSchema = z.object({
  protocol: z.string().min(2, "Protocol name required"),
  chain: z.string().default("all"),
});

addEntrypoint({
  key: "analyze-protocol",
  description: "PREMIUM: Deep dive into a specific protocol. Fetches all pools, researches audit history, checks for past exploits, and provides AI risk analysis.",
  input: protocolSchema,
  price: "0.75",
  handler: async (ctx) => {
    const { protocol, chain } = ctx.input as z.infer<typeof protocolSchema>;
    
    // Fetch protocol yields from DeFiLlama
    const allPools = await fetchYields();
    const protocolPools = allPools.filter(p => 
      p.project.toLowerCase().includes(protocol.toLowerCase()) &&
      (chain === "all" || p.chain.toLowerCase() === chain.toLowerCase())
    );
    
    if (protocolPools.length === 0) {
      return {
        output: {
          success: false,
          error: `No pools found for ${protocol}`,
          tedNote: "Either this protocol doesn't exist on DeFiLlama, or you spelled it wrong. Both are red flags.",
        }
      };
    }
    
    // Calculate protocol stats
    const totalTvl = protocolPools.reduce((sum, p) => sum + (p.tvlUsd || 0), 0);
    const avgApy = protocolPools.reduce((sum, p) => sum + (p.apy || 0), 0) / protocolPools.length;
    const chains = [...new Set(protocolPools.map(p => p.chain))];
    const pools = protocolPools.map(p => ({
      chain: p.chain,
      asset: p.symbol,
      apy: p.apy?.toFixed(2) + '%',
      tvl: formatTvl(p.tvlUsd),
      risk: assessPoolRisk(p).level,
    })).sort((a, b) => parseFloat(b.apy) - parseFloat(a.apy)).slice(0, 15);
    
    // Research audits and hacks
    const [auditResults, hackResults] = await Promise.all([
      searchProtocolAudits(protocol),
      searchProtocolHacks(protocol),
    ]);
    
    // AI analysis
    let aiAnalysis: any = null;
    try {
      const prompt = `Analyze this DeFi protocol for yield farming:

Protocol: ${protocol}
Total TVL: $${(totalTvl / 1e6).toFixed(2)}M
Average APY: ${avgApy.toFixed(2)}%
Active Chains: ${chains.join(', ')}
Number of Pools: ${protocolPools.length}

Top Pools:
${pools.slice(0, 10).map(p => `- ${p.asset} on ${p.chain}: ${p.apy} APY, ${p.tvl} TVL, ${p.risk} risk`).join('\n')}

Audit search results: ${auditResults.map(a => a.title).join('; ') || 'None found'}
Hack/exploit search results: ${hackResults.map(h => h.title).join('; ') || 'None found'}

Provide analysis as JSON:
{
  "overallRisk": "low|medium|high|critical",
  "sustainabilityScore": "1-10 (10 = sustainable real yield)",
  "redFlags": ["any concerns"],
  "greenFlags": ["positive indicators"],
  "yieldSource": "where the yield actually comes from",
  "bestPools": ["top 3 recommended pools with reasoning"],
  "avoid": ["pools or strategies to avoid"],
  "tedVerdict": "sardonic but useful take"
}`;

      const aiResponse = await callAI(YIELD_ANALYST_PROMPT, prompt);
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (error) {
      console.error("AI analysis failed:", error);
    }
    
    return {
      output: {
        success: true,
        protocol,
        overview: {
          totalTvl: formatTvl(totalTvl),
          tvlRaw: totalTvl,
          averageApy: avgApy.toFixed(2) + '%',
          poolCount: protocolPools.length,
          activeChains: chains,
        },
        topPools: pools,
        research: {
          audits: auditResults,
          exploitHistory: hackResults,
          auditWarning: auditResults.length === 0 ? "No audits found - DYOR heavily" : null,
          hackWarning: hackResults.some(h => h.title.toLowerCase().includes('hack') || h.title.toLowerCase().includes('exploit')) 
            ? "Potential exploit history found - investigate before depositing" : null,
        },
        aiAnalysis: aiAnalysis || { error: "AI analysis unavailable" },
        tedNote: aiAnalysis 
          ? `Protocol analysis complete. I pulled live data, searched for audits and hacks, and gave you my honest take. ${totalTvl > 100e6 ? "Size provides some security, but remember TVL can exit fast." : "Low TVL = higher risk. You're early or you're wrong."}`
          : "Data gathered but AI analysis failed. Trust the numbers, not the narrative.",
      }
    };
  },
});

// Find best yields
addEntrypoint({
  key: "find",
  description: "Find the best DeFi yields across chains and protocols. Real data from DeFiLlama, real opinions from Ted.",
  input: findSchema,
  price: "0.25",
  handler: async (ctx) => {
    const { chain, asset, minApy, maxApy, minTvl, maxRisk, stablecoinOnly, limit } = ctx.input as z.infer<typeof findSchema>;
    
    const allPools = await fetchYields();
    
    if (allPools.length === 0) {
      return {
        output: {
          error: "Failed to fetch yield data from DeFiLlama. Try again in a moment.",
          tedComment: "DeFiLlama is taking a llama break. The APIs that power DeFi are themselves centralized services. Ironic, isn't it?",
        },
      };
    }
    
    // Filter pools
    let pools = allPools.filter(p => {
      // Chain filter
      if (chain !== "all") {
        const chainNames = CHAIN_MAP[chain] || [chain];
        if (!chainNames.some(c => p.chain.toLowerCase().includes(c.toLowerCase()))) {
          return false;
        }
      }
      
      // Asset filter
      if (asset && !p.symbol.toLowerCase().includes(asset.toLowerCase())) {
        return false;
      }
      
      // APY filters
      if (minApy !== undefined && p.apy < minApy) return false;
      if (maxApy !== undefined && p.apy > maxApy) return false;
      
      // TVL filter
      if (minTvl !== undefined && p.tvlUsd < minTvl) return false;
      
      // Stablecoin filter
      if (stablecoinOnly && !p.stablecoin) return false;
      
      // Exclude zero/null APY
      if (!p.apy || p.apy <= 0) return false;
      
      return true;
    });
    
    // Transform and assess risk
    let yields = pools.map(transformPool);
    
    // Risk filter (after transformation)
    if (maxRisk) {
      const riskOrder = { low: 1, medium: 2, high: 3 };
      const maxLevel = riskOrder[maxRisk];
      yields = yields.filter(y => riskOrder[y.riskLevel] <= maxLevel);
    }
    
    // Sort by APY descending
    yields.sort((a, b) => b.apy - a.apy);
    
    // Limit
    yields = yields.slice(0, limit);
    
    // Generate summary
    const avgApy = yields.length > 0 
      ? yields.reduce((sum, y) => sum + y.apy, 0) / yields.length 
      : 0;
    
    const riskDistribution = {
      low: yields.filter(y => y.riskLevel === "low").length,
      medium: yields.filter(y => y.riskLevel === "medium").length,
      high: yields.filter(y => y.riskLevel === "high").length,
    };
    
    let overallComment: string;
    if (yields.length === 0) {
      overallComment = "No pools match your criteria. Either your standards are too high or the market is too boring right now.";
    } else if (avgApy > 30) {
      overallComment = "These yields look great on paper. Remember: in DeFi, when something looks too good to be true, you're usually the product, not the customer.";
    } else if (riskDistribution.high > riskDistribution.low) {
      overallComment = "Most of these are high-risk plays. You're not yield farming, you're yield gambling. Know the difference.";
    } else if (riskDistribution.low > yields.length / 2) {
      overallComment = "Relatively conservative options. Won't make you rich, probably won't make you poor either.";
    } else {
      overallComment = "Mixed bag of opportunities. Do your own research on each protocol before aping in.";
    }
    
    return {
      output: {
        overallComment,
        summary: {
          totalFound: yields.length,
          averageApy: `${avgApy.toFixed(2)}%`,
          riskDistribution,
          filters: { chain, asset, minApy, maxRisk, stablecoinOnly },
        },
        yields,
        dataSource: "DeFiLlama (yields.llama.fi)",
        disclaimer: "APYs are historical and not guaranteed. DeFi protocols can be exploited. Only invest what you can afford to lose. This is not financial advice - it's a search engine with opinions.",
      },
    };
  },
});

// Compare protocols
addEntrypoint({
  key: "compare",
  description: "Compare yields across specific protocols. Head-to-head analysis with commentary.",
  input: compareSchema,
  price: "0.15",
  handler: async (ctx) => {
    const { protocols, chain } = ctx.input as z.infer<typeof compareSchema>;
    
    const allPools = await fetchYields();
    
    if (allPools.length === 0) {
      return {
        output: {
          error: "Failed to fetch yield data",
          tedComment: "The oracle is offline. Even DeFi can't escape infrastructure dependencies.",
        },
      };
    }
    
    const comparison: Record<string, {
      pools: YieldPool[];
      avgApy: number;
      totalTvl: number;
      riskProfile: string;
    }> = {};
    
    for (const protocol of protocols) {
      let pools = allPools.filter(p => 
        p.project.toLowerCase().includes(protocol.toLowerCase())
      );
      
      if (chain) {
        const chainNames = CHAIN_MAP[chain] || [chain];
        pools = pools.filter(p => 
          chainNames.some(c => p.chain.toLowerCase().includes(c.toLowerCase()))
        );
      }
      
      const transformed = pools.filter(p => p.apy > 0).map(transformPool);
      const avgApy = transformed.length > 0
        ? transformed.reduce((sum, p) => sum + p.apy, 0) / transformed.length
        : 0;
      const totalTvl = pools.reduce((sum, p) => sum + p.tvlUsd, 0);
      
      // Determine risk profile
      const highRiskCount = transformed.filter(p => p.riskLevel === "high").length;
      const lowRiskCount = transformed.filter(p => p.riskLevel === "low").length;
      let riskProfile: string;
      if (transformed.length === 0) riskProfile = "No data";
      else if (highRiskCount > lowRiskCount) riskProfile = "Aggressive";
      else if (lowRiskCount > transformed.length / 2) riskProfile = "Conservative";
      else riskProfile = "Balanced";
      
      comparison[protocol] = {
        pools: transformed.slice(0, 5), // Top 5 per protocol
        avgApy,
        totalTvl,
        riskProfile,
      };
    }
    
    // Rank by average APY
    const rankings = Object.entries(comparison)
      .map(([protocol, data]) => ({
        protocol,
        avgApy: data.avgApy,
        totalTvl: formatTvl(data.totalTvl),
        poolCount: data.pools.length,
        riskProfile: data.riskProfile,
      }))
      .sort((a, b) => b.avgApy - a.avgApy);
    
    const winner = rankings[0];
    let verdict: string;
    if (!winner || winner.avgApy === 0) {
      verdict = "No clear winner - either the protocols aren't on DeFiLlama or they have no active yield pools.";
    } else if (rankings.length > 1 && rankings[0].avgApy > rankings[1].avgApy * 1.5) {
      verdict = `${winner.protocol} wins by a landslide, but ask yourself why the APY is so much higher. Usually it's either more risk or more inflation.`;
    } else {
      verdict = `${winner.protocol} leads on raw APY, but consider TVL and risk profile before deciding. Higher yield often means higher risk of getting rekt.`;
    }
    
    return {
      output: {
        verdict,
        rankings,
        comparison,
        tedComment: "Comparing protocols is like comparing casinos. Some have better odds, but they're all designed to take your money. At least DeFi lets you see the code that's taking it.",
      },
    };
  },
});

// Portfolio optimization
addEntrypoint({
  key: "optimize",
  description: "Get yield allocation suggestions based on your risk tolerance. Not financial advice, obviously.",
  input: optimizeSchema,
  price: "0.50",
  handler: async (ctx) => {
    const { amount, riskTolerance, chains, stablecoinOnly } = ctx.input as z.infer<typeof optimizeSchema>;
    
    const allPools = await fetchYields();
    
    if (allPools.length === 0) {
      return {
        output: {
          error: "Failed to fetch yield data",
        },
      };
    }
    
    // Filter by chains
    let pools = allPools.filter(p => {
      const poolChain = p.chain.toLowerCase();
      return chains.some(c => {
        const chainNames = CHAIN_MAP[c] || [c];
        return chainNames.some(cn => poolChain.includes(cn.toLowerCase()));
      });
    });
    
    if (stablecoinOnly) {
      pools = pools.filter(p => p.stablecoin);
    }
    
    // Filter by risk tolerance
    const transformed = pools.filter(p => p.apy > 0).map(transformPool);
    
    let eligiblePools: YieldPool[];
    let maxPositions: number;
    let targetRiskLevel: string;
    
    switch (riskTolerance) {
      case "conservative":
        eligiblePools = transformed.filter(p => p.riskLevel === "low" && p.tvlRaw > 10_000_000);
        maxPositions = 5;
        targetRiskLevel = "Mainly blue-chip protocols with >$10M TVL";
        break;
      case "moderate":
        eligiblePools = transformed.filter(p => p.riskLevel !== "high" && p.tvlRaw > 1_000_000);
        maxPositions = 7;
        targetRiskLevel = "Mix of established and emerging protocols, no high-risk";
        break;
      case "aggressive":
        eligiblePools = transformed.filter(p => p.tvlRaw > 100_000);
        maxPositions = 10;
        targetRiskLevel = "Includes high-risk, high-reward opportunities";
        break;
    }
    
    // Sort by risk-adjusted return (simple: APY / risk factor)
    const riskMultiplier = { low: 1, medium: 0.7, high: 0.4 };
    eligiblePools.sort((a, b) => {
      const aScore = a.apy * riskMultiplier[a.riskLevel];
      const bScore = b.apy * riskMultiplier[b.riskLevel];
      return bScore - aScore;
    });
    
    // Take top pools
    const selectedPools = eligiblePools.slice(0, maxPositions);
    
    if (selectedPools.length === 0) {
      return {
        output: {
          error: "No suitable pools found for your criteria",
          tedComment: "Your filters are too restrictive, or the chains you selected don't have qualifying yields. Try broader criteria.",
        },
      };
    }
    
    // Allocate with diversification
    // Higher APY gets more, but capped for diversification
    const totalScore = selectedPools.reduce((sum, p) => sum + p.apy, 0);
    const allocation = selectedPools.map(pool => {
      const rawPercentage = (pool.apy / totalScore) * 100;
      // Cap any single position at 30%
      const cappedPercentage = Math.min(rawPercentage, 30);
      return {
        protocol: pool.protocol,
        asset: pool.asset,
        chain: pool.chain,
        apy: pool.apy,
        riskLevel: pool.riskLevel,
        percentage: Math.round(cappedPercentage),
        amount: Math.round((cappedPercentage / 100) * amount),
        tedComment: pool.tedComment,
      };
    });
    
    // Normalize percentages to 100
    const totalPercentage = allocation.reduce((sum, a) => sum + a.percentage, 0);
    if (totalPercentage !== 100) {
      const adjustment = (100 - totalPercentage) / allocation.length;
      allocation.forEach(a => {
        a.percentage = Math.round(a.percentage + adjustment);
        a.amount = Math.round((a.percentage / 100) * amount);
      });
    }
    
    // Calculate weighted APY
    const weightedApy = allocation.reduce((sum, a) => sum + (a.apy * a.percentage / 100), 0);
    const expectedYearlyReturn = (amount * weightedApy / 100);
    
    let overallComment: string;
    if (riskTolerance === "conservative") {
      overallComment = "Conservative allocation focusing on battle-tested protocols. You won't get rich quick, but you probably won't get rekt either.";
    } else if (riskTolerance === "aggressive") {
      overallComment = "Aggressive allocation with higher yield potential. Also higher potential for watching your portfolio go to zero. You've been warned.";
    } else {
      overallComment = "Balanced approach - some safe harbors, some moonshots. A reasonable strategy if you can resist the urge to go full degen.";
    }
    
    return {
      output: {
        overallComment,
        summary: {
          totalAmount: `$${amount.toLocaleString()}`,
          positions: allocation.length,
          weightedApy: `${weightedApy.toFixed(2)}%`,
          expectedYearlyReturn: `$${expectedYearlyReturn.toFixed(2)}`,
          riskProfile: targetRiskLevel,
        },
        allocation,
        warnings: [
          "This is algorithmic allocation, not financial advice",
          "APYs change constantly - rebalance regularly",
          "Smart contract risk exists for all protocols",
          "Past yields don't guarantee future returns",
        ],
        tedComment: "I've given you a spreadsheet, not a crystal ball. The market will do what it does regardless of what any algorithm suggests. Stay humble, stay solvent.",
      },
    };
  },
});

// Serve logo
app.get('/logo.jpg', (c) => {
  try {
    const logoPath = join(process.cwd(), 'public', 'logo.jpg');
    const logo = readFileSync(logoPath);
    return new Response(logo, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }
    });
  } catch {
    return c.text('Logo not found', 404);
  }
});

export { app };
