/* Adadrome mock protocol data — demo figures, not live on-chain data. */
const ADADROME = (() => {
  const TOKENS = {
    ADA:   { symbol: "ADA",   name: "Cardano",            price: 0.85,     decimals: 6, color: "#0033AD", icon: "₳" },
    DROME: { symbol: "DROME", name: "Adadrome",           price: 0.12,     decimals: 6, color: "#7C5CFF", icon: "◈" },
    DJED:  { symbol: "DJED",  name: "Djed Stablecoin",    price: 1.0,      decimals: 6, color: "#00C2A8", icon: "◉" },
    IUSD:  { symbol: "iUSD",  name: "iUSD Stablecoin",    price: 1.0,      decimals: 6, color: "#2DD4BF", icon: "$" },
    MIN:   { symbol: "MIN",   name: "Minswap",            price: 0.045,    decimals: 6, color: "#4ADE80", icon: "⬢" },
    SNEK:  { symbol: "SNEK",  name: "Snek",               price: 0.0012,   decimals: 0, color: "#F472B6", icon: "🐍" },
    WMTX:  { symbol: "WMTX",  name: "World Mobile Token", price: 0.32,     decimals: 6, color: "#38BDF8", icon: "🌐" },
    HOSKY: { symbol: "HOSKY", name: "Hosky",              price: 0.000082, decimals: 0, color: "#FBBF24", icon: "🐶" },
  };

  // Volatile pools use x*y=k. Stable pools use a StableSwap-ish curve (approximated).
  const POOLS = [
    { id: "ada-djed",  t0: "ADA",  t1: "DJED",  type: "stable",   fee: 0.0005, tvl: 8_400_000, vol24h: 1_900_000, r0: 4_200_000, r1: 4_200_000 },
    { id: "ada-iusd",  t0: "ADA",  t1: "IUSD",  type: "stable",   fee: 0.0005, tvl: 5_100_000, vol24h: 1_100_000, r0: 2_550_000, r1: 2_550_000 },
    { id: "djed-iusd", t0: "DJED", t1: "IUSD",  type: "stable",   fee: 0.0002, tvl: 2_800_000, vol24h: 640_000,   r0: 1_400_000, r1: 1_400_000 },
    { id: "ada-min",   t0: "ADA",  t1: "MIN",   type: "volatile", fee: 0.003,  tvl: 6_200_000, vol24h: 2_400_000, r0: 3_100_000, r1: 58_000_000 },
    { id: "ada-snek",  t0: "ADA",  t1: "SNEK",  type: "volatile", fee: 0.003,  tvl: 4_600_000, vol24h: 3_100_000, r0: 2_300_000, r1: 1_630_000_000 },
    { id: "ada-wmtx",  t0: "ADA",  t1: "WMTX",  type: "volatile", fee: 0.003,  tvl: 3_300_000, vol24h: 980_000,   r0: 1_650_000, r1: 4_380_000 },
    { id: "ada-hosky", t0: "ADA",  t1: "HOSKY", type: "volatile", fee: 0.003,  tvl: 1_900_000, vol24h: 1_500_000, r0: 950_000,   r1: 9_850_000_000 },
    { id: "min-djed",  t0: "MIN",  t1: "DJED",  type: "volatile", fee: 0.003,  tvl: 1_200_000, vol24h: 410_000,   r0: 13_300_000, r1: 600_000 },
  ];

  // Weekly gauge votes (veDROME) and emissions for the current epoch.
  const GAUGES = [
    { poolId: "ada-snek",  votes: 1_240_000, bribeApr: 38.2 },
    { poolId: "ada-min",   votes: 980_000,   bribeApr: 24.6 },
    { poolId: "ada-djed",  votes: 870_000,    bribeApr: 12.4 },
    { poolId: "ada-iusd",  votes: 640_000,    bribeApr: 9.8 },
    { poolId: "ada-wmtx",  votes: 410_000,    bribeApr: 18.1 },
    { poolId: "ada-hosky", votes: 355_000,    bribeApr: 31.7 },
    { poolId: "djed-iusd", votes: 290_000,    bribeApr: 6.2 },
    { poolId: "min-djed",  votes: 150_000,    bribeApr: 14.9 },
  ];

  const BRIBES = [
    { poolId: "ada-snek",  token: "SNEK",  amount: 48_000_000, usd: 57_600,  by: "Snek DAO" },
    { poolId: "ada-hosky", token: "HOSKY", amount: 900_000_000, usd: 73_800, by: "Hosky Kennel" },
    { poolId: "ada-min",   token: "MIN",   amount: 320_000,   usd: 14_400,  by: "Minswap Labs" },
    { poolId: "ada-wmtx",  token: "WMTX",  amount: 55_000,    usd: 17_600,  by: "World Mobile" },
    { poolId: "ada-djed",  token: "DJED",  amount: 9_500,     usd: 9_500,   by: "Djed Alliance" },
    { poolId: "ada-iusd",  token: "IUSD",  amount: 7_200,     usd: 7_200,   by: "Indigo" },
  ];

  const EPOCH_SECONDS = 5 * 24 * 3600; // Cardano-native 5-day epochs
  const EPOCH_GENESIS = Date.UTC(2026, 8, 21, 21, 44, 0); // a past epoch boundary
  const EMISSIONS_PER_EPOCH = 1_250_000; // DROME
  const MAX_LOCK_WEEKS = 208; // 4 years, like ve(3,3)

  const fmtUSD = (n) => n >= 1e9 ? "$" + (n/1e9).toFixed(2) + "B"
    : n >= 1e6 ? "$" + (n/1e6).toFixed(2) + "M"
    : n >= 1e3 ? "$" + (n/1e3).toFixed(1) + "K"
    : "$" + n.toFixed(2);
  const fmtNum = (n) => n >= 1e9 ? (n/1e9).toFixed(2) + "B"
    : n >= 1e6 ? (n/1e6).toFixed(2) + "M"
    : n >= 1e3 ? (n/1e3).toFixed(1) + "K"
    : n.toFixed(n < 1 ? 4 : 2);

  function epochInfo(now = Date.now()) {
    const elapsed = Math.floor((now - EPOCH_GENESIS) / 1000);
    const epoch = Math.floor(elapsed / EPOCH_SECONDS);
    const intoEpoch = elapsed - epoch * EPOCH_SECONDS;
    const remaining = EPOCH_SECONDS - intoEpoch;
    return { epoch: epoch + 1, remaining };
  }

  function poolFor(a, b) {
    return POOLS.find(p => (p.t0 === a && p.t1 === b) || (p.t0 === b && p.t1 === a));
  }
  function quote(from, to, amtIn) {
    const pool = poolFor(from, to);
    if (!pool || !amtIn || amtIn <= 0) return null;
    const fwd = pool.t0 === from;
    const rIn = fwd ? pool.r0 : pool.r1, rOut = fwd ? pool.r1 : pool.r0;
    const fee = pool.fee;
    const amtInFee = amtIn * (1 - fee);
    let out, midPx;
    if (pool.type === "stable") {
      // StableSwap approx: the mid price is the tokens' price ratio, NOT the
      // reserve ratio. The stable reserves are seeded in equal token counts
      // even when prices differ (e.g. ADA/DJED at 0.85), so rOut/rIn (= 1)
      // misstates both the displayed rate and the price impact — it made
      // every ADA stable swap read ~15%+ impact and trip the swap guard.
      midPx = TOKENS[from].price / TOKENS[to].price;
      const depth = Math.min(1, rIn / (amtIn * 20));
      out = amtInFee * midPx * (1 - 0.001 * (1 - depth));
    } else {
      midPx = rOut / rIn;
      out = (amtInFee * rOut) / (rIn + amtInFee);
    }
    const effPx = out / amtIn;
    const impact = Math.abs((effPx - midPx) / midPx) * 100;
    return { out, impact, fee, pool, rate: midPx };
  }

  /* ---------- Concentrated liquidity pools (Uniswap v3-style ticks) ----------
     price = human t1 per t0. tick price: p(tick) = 1.0001^tick            */
  const CLPOOLS = [
    { id: "cl-ada-djed", t0: "ADA", t1: "DJED", fee: 0.0005, spacing: 10, price: 0.85,   tvl: 3_200_000, vol24h: 890_000 },
    { id: "cl-ada-min",  t0: "ADA", t1: "MIN",  fee: 0.003,  spacing: 60, price: 18.9,    tvl: 2_400_000, vol24h: 1_150_000 },
    { id: "cl-ada-snek", t0: "ADA", t1: "SNEK", fee: 0.01,   spacing: 60, price: 708.0,   tvl: 1_600_000, vol24h: 1_700_000 },
  ];

  // Seeded pseudo-random so the liquidity histogram is stable between loads.
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function clTick(pool) { return Math.round(Math.log(pool.price) / Math.log(1.0001) / pool.spacing) * pool.spacing; }
  function tickPrice(tick) { return Math.pow(1.0001, tick); }

  // Liquidity histogram: 48 buckets around the current tick.
  function clDepth(pool) {
    const tc = clTick(pool), rnd = mulberry32(hashStr(pool.id)), buckets = [];
    for (let i = -24; i < 24; i++) {
      const tick = tc + i * pool.spacing * 4;
      const gauss = Math.exp(-Math.pow(i / 9, 2));
      buckets.push({ tick, price: tickPrice(tick), liq: pool.tvl * (0.15 + 0.85 * gauss) * (0.55 + 0.9 * rnd()) });
    }
    return { tick: tc, buckets };
  }

  /* Uniswap v3 math (human token units) */
  const CLM = {
    amountsForLiq(sqrtP, sqrtA, sqrtB, L) {
      let a0 = 0, a1 = 0;
      if (sqrtP <= sqrtA) a0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB);
      else if (sqrtP >= sqrtB) a1 = L * (sqrtB - sqrtA);
      else { a0 = L * (sqrtB - sqrtP) / (sqrtP * sqrtB); a1 = L * (sqrtP - sqrtA); }
      return [a0, a1];
    },
    liqForA0(sqrtA, sqrtB, a0) { return a0 * (sqrtA * sqrtB) / (sqrtB - sqrtA); },
    liqForA0InRange(sqrtP, sqrtB, a0) { return a0 * (sqrtP * sqrtB) / (sqrtB - sqrtP); },
    liqForA1(sqrtA, sqrtB, a1) { return a1 / (sqrtB - sqrtA); },
  };

  return { TOKENS, POOLS, GAUGES, BRIBES, CLPOOLS, poolFor, quote, clTick, tickPrice, clDepth, CLM, EPOCH_SECONDS, EMISSIONS_PER_EPOCH, MAX_LOCK_WEEKS, fmtUSD, fmtNum, epochInfo };
})();
