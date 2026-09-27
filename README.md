# ◈ Adadrome — Cardano's Liquidity Hub

A **ve(3,3) decentralized exchange** for Cardano, inspired by [Aerodrome Finance](https://aerodrome.finance) on Base — rebuilt with Cardano-native 5-day epochs and **concentrated liquidity** (Uniswap v3-style tick positions).

> ⚠ **Demo build:** all balances, quotes, positions, votes and rewards are simulated client-side. Nothing here touches mainnet.

## Features

- **Swap** — volatile (`x·y=k`) and stable pools, live quotes, price impact, slippage control
- **Classic liquidity** — 50/50 pools staked in gauges earning DROME emissions
- **Concentrated liquidity (v2)** — pick a price range on tick-based pools, mint a Position NFT, earn boosted fees while in range; liquidity-depth chart per pool
- **Vote** — lock DROME → veDROME (vote-escrowed NFT, up to 4 years), direct epoch emissions to gauges, claim 100% of pool fees
- **Bribe marketplace** — protocols bribe veDROME voters to route emissions at their pools
- **Dashboard** — TVL, volume, fees, emissions, volume-by-pool chart, tokenomics
- **Wallet** — attempts CIP-30 connection, falls back to a demo wallet

## Run it

No build step — it's a static site. Serve the folder or open `index.html`:

```bash
cd adadrome && python3 -m http.server 8000
# → http://localhost:8000
```

Or visit the live GitHub Pages deploy: **https://kshot3000.github.io/Adadrome/**

## Tech

Plain HTML/CSS/JS. Tick math follows the Uniswap v3 whitepaper (`p(tick) = 1.0001^tick`).

Built by [@kshot9000](https://x.com/kshot9000)
