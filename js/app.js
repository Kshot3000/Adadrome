/* Adadrome front-end — demo build. Quotes/positions/votes are simulated client-side. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem("adadrome:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("adadrome:" + k, JSON.stringify(v)); } catch {} },
};

const state = {
  view: "swap",
  wallet: null, // { address, demo:true }
  balances: store.get("balances", { ADA: 1250.5, DROME: 42000, DJED: 320, IUSD: 150, MIN: 8200, SNEK: 950000, WMTX: 410, HOSKY: 12000000 }),
  locks: store.get("locks", []),           // { amount, weeks, power, created }
  votes: store.get("votes", {}),           // poolId -> pct
  positions: store.get("positions", []),   // { poolId, t0amt, t1amt }
  clPositions: store.get("clPositions", []), // { id, poolId, tickL, tickU, L, a0, a1, created, feeUsd, lastAccrue }
  bribes: store.get("bribes", null) || null,
  txs: store.get("txs", []),
  swap: { from: "ADA", to: "SNEK", fromAmt: "", toAmt: "", slippage: 0.5, picking: null },
};
if (!state.bribes) state.bribes = JSON.parse(JSON.stringify(ADADROME.BRIBES));

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
function tokIcon(sym, size) {
  const t = ADADROME.TOKENS[sym];
  return `<span class="tok-ico" style="background:${t.color}">${t.icon}</span>`;
}
function fmtAmt(n, sym) {
  const d = ADADROME.TOKENS[sym]?.decimals ?? 6;
  if (n === 0) return "0";
  if (n >= 1e9) return (n/1e9).toFixed(3) + "B";
  if (n >= 1e6) return (n/1e6).toFixed(3) + "M";
  if (n >= 1e3) return (n/1e3).toFixed(2) + "K";
  return n.toFixed(Math.min(d, n < 0.01 ? 6 : 4));
}
function save() {
  store.set("balances", state.balances); store.set("locks", state.locks);
  store.set("votes", state.votes); store.set("positions", state.positions);
  store.set("bribes", state.bribes); store.set("txs", state.txs);
  store.set("clPositions", state.clPositions);
}
function shortAddr(a) { return a.length > 16 ? a.slice(0, 10) + "…" + a.slice(-6) : a; }

/* ---------- epoch countdown ---------- */
function tickEpoch() {
  const { epoch, remaining } = ADADROME.epochInfo();
  const d = Math.floor(remaining / 86400), h = Math.floor(remaining % 86400 / 3600),
        m = Math.floor(remaining % 3600 / 60), s = remaining % 60;
  const el = $("#epochChip");
  if (el) el.innerHTML = `Epoch <b>#${epoch}</b> ends in <b>${d}d ${h}h ${m}m ${s}s</b>`;
  const el2 = $("#epochLeft2");
  if (el2) el2.textContent = `${d}d ${h}h ${m}m ${s}s`;
}
setInterval(tickEpoch, 1000);

/* ---------- router ---------- */
function showView(name) {
  state.view = name;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  ({ swap: renderSwap, liq: renderLiq, vote: renderVote, bribes: renderBribes, dash: renderDash })[name]();
  window.scrollTo({ top: 0 });
}

/* ---------- wallet (CIP-30 attempt, demo fallback) ---------- */
async function connectWallet() {
  if (state.wallet) { state.wallet = null; save(); renderWallet(); toast("Wallet disconnected."); return; }
  const wallets = window.cardano ? Object.keys(window.cardano).filter(k => window.cardano[k]?.enable) : [];
  if (wallets.length) {
    try {
      const api = await window.cardano[wallets[0]].enable();
      const addrs = await api.getUsedAddresses().catch(() => []);
      state.wallet = { address: addrs[0] || wallets[0] + " (no address exposed)", demo: false, name: wallets[0] };
      toast("Connected via " + wallets[0] + ". Demo balances still apply.");
    } catch { state.wallet = null; }
  }
  if (!state.wallet) {
    state.wallet = { address: "addr1qydemo9adadrome7x8v…kshot9000", demo: true, name: "Demo Wallet" };
    toast("No CIP-30 wallet found — using demo wallet.");
  }
  renderWallet();
}
function renderWallet() {
  const b = $("#walletBtn");
  b.textContent = state.wallet ? (state.wallet.demo ? "🧪 " : "✅ ") + shortAddr(state.wallet.address) : "Connect Wallet";
}

/* ---------- SWAP ---------- */
// Swap quoting lives in js/data.js (ADADROME.quote) so it is unit-testable
// without a DOM; these wrappers keep the app's call sites unchanged.
function poolFor(a, b) { return ADADROME.poolFor(a, b); }
function quote(from, to, amtIn) { return ADADROME.quote(from, to, amtIn); }
function renderSwap() {
  const s = state.swap, T = ADADROME.TOKENS;
  const q = quote(s.from, s.to, parseFloat(s.fromAmt));
  $("#swapFromBtn").innerHTML = `${tokIcon(s.from)} ${s.from} <span style="color:var(--mut)">▾</span>`;
  $("#swapToBtn").innerHTML = `${tokIcon(s.to)} ${s.to} <span style="color:var(--mut)">▾</span>`;
  $("#fromBal").textContent = "Balance: " + fmtAmt(state.balances[s.from] || 0, s.from);
  $("#toBal").textContent = "Balance: " + fmtAmt(state.balances[s.to] || 0, s.to);
  if (q) {
    s.toAmt = q.out;
    $("#swapToAmt").value = fmtAmt(q.out, s.to);
    const ic = q.impact < 1 ? "" : q.impact < 5 ? "warn" : "bad";
    $("#quoteRows").innerHTML = `
      <div class="qr"><span>Rate</span><b>1 ${s.from} ≈ ${fmtAmt(q.rate, s.to)} ${s.to}</b></div>
      <div class="qr"><span>Price impact</span><b class="${ic}">${q.impact.toFixed(2)}%</b></div>
      <div class="qr"><span>Fee (${(q.fee*100).toFixed(2)}%)</span><b>${fmtAmt(parseFloat(s.fromAmt)*q.fee, s.from)} ${s.from} → veDROME voters</b></div>
      <div class="qr"><span>Route</span><b>${s.from} → ${s.to} (${q.pool.type})</b></div>
      <div class="qr"><span>Min. received (${s.slippage}%)</span><b>${fmtAmt(q.out*(1-s.slippage/100), s.to)} ${s.to}</b></div>`;
    $("#swapBtn").disabled = false;
  } else {
    $("#swapToAmt").value = "";
    $("#quoteRows").innerHTML = `<div class="qr"><span>Enter an amount to see the quote.</span></div>`;
    $("#swapBtn").disabled = true;
  }
}
function doSwap() {
  if (!state.wallet) return toast("Connect a wallet first.");
  const s = state.swap, amt = parseFloat(s.fromAmt), q = quote(s.from, s.to, amt);
  if (!q) return;
  if ((state.balances[s.from] || 0) < amt) return toast("Insufficient " + s.from + " balance.");
  if (q.impact > 15) return toast("Price impact too high — reduce size.");
  state.balances[s.from] -= amt;
  state.balances[s.to] = (state.balances[s.to] || 0) + q.out;
  state.txs.unshift({ kind: "Swap", detail: `${fmtAmt(amt, s.from)} ${s.from} → ${fmtAmt(q.out, s.to)} ${s.to}`, t: Date.now() });
  s.fromAmt = ""; $("#swapFromAmt").value = "";
  save(); renderSwap(); renderTxList();
  toast(`Swapped ${fmtAmt(amt, s.from)} ${s.from} for ${fmtAmt(q.out, s.to)} ${s.to} (simulated)`);
}

/* token picker modal */
function openPicker(which) {
  state.swap.picking = which;
  const list = Object.values(ADADROME.TOKENS).map(t => `
    <button class="tok-item" data-sym="${t.symbol}">
      ${tokIcon(t.symbol)}<span class="nm">${t.symbol}<small>${t.name} · $${t.price}</small></span>
      <span class="bal">${fmtAmt(state.balances[t.symbol] || 0, t.symbol)}</span>
    </button>`).join("");
  $("#tokList").innerHTML = list;
  $("#pickerOverlay").classList.add("open");
}
function renderTxList() {
  const el = $("#txList"); if (!el) return;
  el.innerHTML = state.txs.slice(0, 8).map(t =>
    `<div class="qr"><span>${t.kind}</span><b>${t.detail}</b></div>`).join("") || `<p class="mut">No transactions yet.</p>`;
}

/* ---------- LIQUIDITY ---------- */
function gaugeOf(poolId) { return ADADROME.GAUGES.find(g => g.poolId === poolId); }
function gaugeApr(g) {
  const totalVotes = ADADROME.GAUGES.reduce((a, x) => a + x.votes, 0);
  const share = g.votes / totalVotes;
  const dromeUsd = ADADROME.TOKENS.DROME.price;
  const yearly = ADADROME.EMISSIONS_PER_EPOCH * dromeUsd * (365 / 5) * share;
  const pool = ADADROME.POOLS.find(p => p.id === g.poolId);
  const feeApr = (pool.vol24h * 365 * pool.fee) / pool.tvl * 100;
  return { emApr: yearly / pool.tvl * 100, feeApr, total: yearly / pool.tvl * 100 + feeApr };
}
function renderLiq() {
  const rows = ADADROME.POOLS.map(p => {
    const g = gaugeOf(p.id), apr = gaugeApr(g);
    const pos = state.positions.filter(x => x.poolId === p.id);
    return `<tr>
      <td><span class="pair">${tokIcon(p.t0)}${tokIcon(p.t1)} ${p.t0} / ${p.t1}</span><br>
        <span class="pill ${p.type === "stable" ? "stable" : "vol"}">${p.type}</span>
        ${pos.length ? ` <span class="pill" style="background:rgba(47,107,255,.16);color:#9dbcff">your position</span>` : ""}</td>
      <td class="num">${ADADROME.fmtUSD(p.tvl)}</td>
      <td class="num">${ADADROME.fmtUSD(p.vol24h)}</td>
      <td class="num apr">${apr.total.toFixed(1)}%</td>
      <td class="num"><button class="btn small" data-deposit="${p.id}">+ Add</button>
        <button class="btn small ghost" data-zap="${p.id}" title="Deposit a single token">⚡ Zap</button></td>
    </tr>`;
  }).join("");
  $("#liqRows").innerHTML = rows;
  $$("#liqRows [data-deposit]").forEach(b => b.onclick = () => openDeposit(b.dataset.deposit));
  $$("#liqRows [data-zap]").forEach(b => b.onclick = () => openZap(b.dataset.zap));
  const my = state.positions.map((x, i) => {
    const p = ADADROME.POOLS.find(q => q.id === x.poolId);
    return `<div class="qr"><span>${p.t0}/${p.t1} LP</span><b>${fmtAmt(x.t0amt, p.t0)} ${p.t0} + ${fmtAmt(x.t1amt, p.t1)} ${p.t1}
      <button class="btn small ghost" data-wd="${i}" style="margin-left:8px">Withdraw</button></b></div>`;
  }).join("");
  $("#myPos").innerHTML = my || `<p class="mut">No positions yet — add liquidity to start earning fees + DROME emissions.</p>`;
  $$("#myPos [data-wd]").forEach(b => b.onclick = () => {
    const x = state.positions[+b.dataset.wd], p = ADADROME.POOLS.find(q => q.id === x.poolId);
    state.balances[p.t0] = (state.balances[p.t0] || 0) + x.t0amt;
    state.balances[p.t1] = (state.balances[p.t1] || 0) + x.t1amt;
    state.positions.splice(+b.dataset.wd, 1); save(); renderLiq(); toast("Position withdrawn (simulated).");
  });
  showLiqTab(state.liqTab || "classic");
}
let depositPool = null;
let zapPlan = null; // { x, y, amt, half, outY, impact }
function setDepMode(mode) {
  $$("#depOverlay [data-depmode]").forEach(b => b.classList.toggle("active", b.dataset.depmode === mode));
  $("#dep5050").style.display = mode === "5050" ? "" : "none";
  $("#depZap").style.display = mode === "zap" ? "" : "none";
}
function openDeposit(poolId) {
  if (!state.wallet) return toast("Connect a wallet first.");
  depositPool = ADADROME.POOLS.find(p => p.id === poolId);
  $("#depTitle").textContent = `Add liquidity · ${depositPool.t0}/${depositPool.t1}`;
  $("#depA").value = ""; $("#depB").value = "";
  setDepMode("5050");
  $("#depOverlay").classList.add("open");
}
function openZap(poolId) {
  if (!state.wallet) return toast("Connect a wallet first.");
  depositPool = ADADROME.POOLS.find(p => p.id === poolId);
  $("#depTitle").textContent = `⚡ Zap into ${depositPool.t0}/${depositPool.t1}`;
  $("#zapTok").innerHTML = [depositPool.t0, depositPool.t1]
    .map(s => `<option value="${s}">${s} — bal ${fmtAmt(state.balances[s] || 0, s)}</option>`).join("");
  $("#zapAmt").value = ""; zapPlan = null; renderZap();
  setDepMode("zap");
  $("#depOverlay").classList.add("open");
}
function zapCompute() {
  const p = depositPool, x = $("#zapTok").value, y = x === p.t0 ? p.t1 : p.t0;
  const amt = parseFloat($("#zapAmt").value);
  zapPlan = null;
  if (!p || !x || !amt || amt <= 0) return;
  if ((state.balances[x] || 0) < amt) return; // insufficient: keep plan null
  const half = amt / 2;
  const q = quote(x, y, half);
  if (!q) return;
  zapPlan = { x, y, amt, half, outY: q.out, impact: q.impact };
}
function renderZap() {
  zapCompute();
  const rows = $("#zapRows"), btn = $("#zapBtn");
  if (!zapPlan) {
    const x = $("#zapTok").value, amt = parseFloat($("#zapAmt").value);
    rows.innerHTML = amt > 0 && (state.balances[x] || 0) < amt
      ? `<div class="qr"><span class="bad">Insufficient ${x} balance.</span></div>`
      : `<div class="qr"><span>Enter an amount to preview the zap.</span></div>`;
    btn.disabled = true; return;
  }
  const z = zapPlan, p = depositPool;
  const t0amt = z.x === p.t0 ? z.half : z.outY;
  const t1amt = z.x === p.t0 ? z.outY : z.half;
  const ic = z.impact < 1 ? "" : z.impact < 5 ? "warn" : "bad";
  rows.innerHTML = `
    <div class="qr"><span>Swap leg</span><b>${fmtAmt(z.half, z.x)} ${z.x} → ${fmtAmt(z.outY, z.y)} ${z.y}</b></div>
    <div class="qr"><span>Swap price impact</span><b class="${ic}">${z.impact.toFixed(2)}%</b></div>
    <div class="qr"><span>LP deposit</span><b>${fmtAmt(t0amt, p.t0)} ${p.t0} + ${fmtAmt(t1amt, p.t1)} ${p.t1}</b></div>
    <div class="qr"><span>Result</span><b>LP position, auto-staked in gauge</b></div>`;
  btn.disabled = false;
}
function doZap() {
  const z = zapPlan, p = depositPool;
  if (!z) return toast("Enter an amount first.");
  if ((state.balances[z.x] || 0) < z.amt) return toast("Insufficient " + z.x + " balance.");
  const t0amt = z.x === p.t0 ? z.half : z.outY;
  const t1amt = z.x === p.t0 ? z.outY : z.half;
  state.balances[z.x] -= z.amt;
  state.positions.push({ poolId: p.id, t0amt, t1amt });
  state.txs.unshift({ kind: "⚡ Zap", detail: `${fmtAmt(z.amt, z.x)} ${z.x} → ${p.t0}/${p.t1} LP`, t: Date.now() });
  $("#depOverlay").classList.remove("open");
  save(); renderLiq();
  toast(`Zapped ${fmtAmt(z.amt, z.x)} ${z.x} into ${p.t0}/${p.t1} LP (simulated).`);
}
function depQuote() {
  const a = parseFloat($("#depA").value);
  if (!a || a <= 0 || !depositPool) { $("#depB").value = ""; return; }
  const p = depositPool, T = ADADROME.TOKENS;
  const ratio = (p.r1 / p.r0) * (T[p.t0].price / T[p.t1].price) / (T[p.t0].price / T[p.t1].price);
  const b = a * (p.r1 / p.r0);
  $("#depB").value = fmtAmt(b, p.t1);
}
function doDeposit() {
  const p = depositPool, a = parseFloat($("#depA").value);
  const b = parseFloat($("#depB").value.replace(/[^0-9.]/g, ""));
  if (!a || !b || a <= 0) return toast("Enter an amount.");
  if ((state.balances[p.t0] || 0) < a || (state.balances[p.t1] || 0) < b) return toast("Insufficient balance.");
  state.balances[p.t0] -= a; state.balances[p.t1] -= b;
  state.positions.push({ poolId: p.id, t0amt: a, t1amt: b });
  state.txs.unshift({ kind: "Add LP", detail: `${fmtAmt(a, p.t0)} ${p.t0} + ${fmtAmt(b, p.t1)} ${p.t1}`, t: Date.now() });
  $("#depOverlay").classList.remove("open");
  save(); renderLiq(); toast("Liquidity added & staked in gauge (simulated).");
}

/* ---------- VOTE ---------- */
function votingPower() { return state.locks.reduce((a, l) => a + l.power, 0); }
function renderVote() {
  const vp = votingPower();
  $("#vpTotal").textContent = ADADROME.fmtNum(vp) + " veDROME";
  const totalVotes = ADADROME.GAUGES.reduce((a, x) => a + x.votes, 0);
  const rows = ADADROME.GAUGES.map(g => {
    const p = ADADROME.POOLS.find(q => q.id === g.poolId);
    const pct = state.votes[g.poolId] || 0;
    const br = state.bribes.find(b => b.poolId === g.poolId);
    return `<tr>
      <td><span class="pair">${tokIcon(p.t0)}${tokIcon(p.t1)} ${p.t0}/${p.t1}</span></td>
      <td class="num">${(g.votes / totalVotes * 100).toFixed(1)}%</td>
      <td class="num">${br ? ADADROME.fmtUSD(br.usd) : "—"}</td>
      <td class="num apr">${g.bribeApr.toFixed(1)}%</td>
      <td style="min-width:190px"><div class="vote-slider">
        <input type="range" min="0" max="100" value="${pct}" data-vote="${g.poolId}">
        <span class="vote-pct" id="vpct-${g.poolId}">${pct}%</span></div></td>
    </tr>`;
  }).join("");
  $("#voteRows").innerHTML = rows;
  $$("#voteRows [data-vote]").forEach(r => r.oninput = () => {
    state.votes[r.dataset.vote] = +r.value;
    $("#vpct-" + r.dataset.vote).textContent = r.value + "%";
    const sum = Object.values(state.votes).reduce((a, b) => a + b, 0);
    $("#voteSum").textContent = sum + "%";
    $("#voteSum").style.color = sum === 100 ? "var(--green)" : sum > 100 ? "var(--red)" : "var(--mut)";
  });
  const sum0 = Object.values(state.votes).reduce((a, b) => a + b, 0);
  $("#voteSum").textContent = sum0 + "%";
  const locks = state.locks.map((l, i) => `
    <div class="venft"><div class="row"><span>veNFT #${1000 + i}</span><b>${ADADROME.fmtNum(l.amount)} DROME locked</b></div>
    <div class="row"><span>Voting power</span><b>${ADADROME.fmtNum(l.power)} veDROME</b></div>
    <div class="row"><span>Unlocks in</span><b>${l.weeks} weeks</b></div></div>`).join("");
  $("#lockList").innerHTML = locks || `<p class="mut">No locks yet. Lock DROME to get veDROME voting power.</p>`;
  $("#lockBal").textContent = fmtAmt(state.balances.DROME || 0, "DROME") + " DROME available";
}
function doLock() {
  if (!state.wallet) return toast("Connect a wallet first.");
  const amt = parseFloat($("#lockAmt").value), weeks = +$("#lockWeeks").value;
  if (!amt || amt <= 0) return toast("Enter a DROME amount.");
  if ((state.balances.DROME || 0) < amt) return toast("Insufficient DROME balance.");
  const power = amt * (weeks / ADADROME.MAX_LOCK_WEEKS);
  state.balances.DROME -= amt;
  state.locks.push({ amount: amt, weeks, power, created: Date.now() });
  state.txs.unshift({ kind: "Lock", detail: `${ADADROME.fmtNum(amt)} DROME → ${ADADROME.fmtNum(power)} veDROME`, t: Date.now() });
  $("#lockAmt").value = "";
  save(); renderVote(); toast(`Locked! Minted veNFT with ${ADADROME.fmtNum(power)} voting power.`);
}
function castVotes() {
  if (!state.wallet) return toast("Connect a wallet first.");
  if (votingPower() <= 0) return toast("Lock DROME first to get voting power.");
  const sum = Object.values(state.votes).reduce((a, b) => a + b, 0);
  if (sum !== 100) return toast("Vote weights must total exactly 100%.");
  state.txs.unshift({ kind: "Vote", detail: `Cast ${ADADROME.fmtNum(votingPower())} veDROME across gauges`, t: Date.now() });
  save(); renderTxList(); toast("Votes cast for this epoch (simulated). Fees + bribes accrue to your veNFT.");
}
function claimRewards() {
  if (votingPower() <= 0) return toast("Nothing to claim — lock DROME and vote first.");
  const reward = votingPower() * 0.00042;
  state.balances.DROME = (state.balances.DROME || 0) + reward;
  state.txs.unshift({ kind: "Claim", detail: `Claimed ${reward.toFixed(2)} DROME in fees + bribes`, t: Date.now() });
  save(); toast(`Claimed ${reward.toFixed(2)} DROME in trading fees + bribes (simulated).`);
}

/* ---------- BRIBES ---------- */
function renderBribes() {
  const rows = state.bribes.map((b, i) => {
    const p = ADADROME.POOLS.find(q => q.id === b.poolId);
    return `<tr>
      <td><span class="pair">${tokIcon(p.t0)}${tokIcon(p.t1)} ${p.t0}/${p.t1}</span></td>
      <td>${tokIcon(b.token)} <b>${ADADROME.fmtNum(b.amount)} ${b.token}</b></td>
      <td class="num">${ADADROME.fmtUSD(b.usd)}</td>
      <td>${b.by}</td>
      <td class="num"><button class="btn small ghost" data-br="${i}">+ Add</button></td>
    </tr>`;
  }).join("");
  $("#bribeRows").innerHTML = rows;
  $$("#bribeRows [data-br]").forEach(x => x.onclick = () => {
    const b = state.bribes[+x.dataset.br];
    $("#bribePoolName").textContent = b.poolId.replace("-", " / ").toUpperCase();
    $("#bribeOverlay").dataset.idx = x.dataset.br;
    $("#bribeAmt").value = "";
    $("#bribeOverlay").classList.add("open");
  });
}
function doBribe() {
  const i = +$("#bribeOverlay").dataset.idx, amt = parseFloat($("#bribeAmt").value);
  if (!amt || amt <= 0) return toast("Enter an amount.");
  const b = state.bribes[i], T = ADADROME.TOKENS[b.token];
  if ((state.balances[b.token] || 0) < amt) return toast("Insufficient " + b.token + " balance.");
  state.balances[b.token] -= amt;
  b.amount += amt; b.usd += amt * T.price;
  state.txs.unshift({ kind: "Bribe", detail: `${ADADROME.fmtNum(amt)} ${b.token} → ${b.poolId} gauge`, t: Date.now() });
  $("#bribeOverlay").classList.remove("open");
  save(); renderBribes(); toast("Bribe deposited — veDROME voters will see it next epoch.");
}

/* ---------- DASHBOARD ---------- */
function renderDash() {
  const P = ADADROME.POOLS, T = ADADROME.TOKENS;
  const tvl = P.reduce((a, p) => a + p.tvl, 0);
  const vol = P.reduce((a, p) => a + p.vol24h, 0);
  const fees = P.reduce((a, p) => a + p.vol24h * p.fee, 0);
  $("#dTvl").textContent = ADADROME.fmtUSD(tvl);
  $("#dVol").textContent = ADADROME.fmtUSD(vol);
  $("#dFees").textContent = ADADROME.fmtUSD(fees);
  $("#dDrome").textContent = "$" + T.DROME.price.toFixed(3);
  $("#dEmis").textContent = ADADROME.fmtNum(ADADROME.EMISSIONS_PER_EPOCH) + " DROME";
  $("#dVoters").textContent = ADADROME.fmtNum(12840);
  drawChart();
  const top = [...P].sort((a, b) => b.vol24h - a.vol24h).slice(0, 5).map(p => {
    const g = gaugeOf(p.id), apr = gaugeApr(g);
    return `<tr><td><span class="pair">${tokIcon(p.t0)}${tokIcon(p.t1)} ${p.t0}/${p.t1}</span></td>
      <td class="num">${ADADROME.fmtUSD(p.vol24h)}</td><td class="num">${ADADROME.fmtUSD(p.tvl)}</td>
      <td class="num apr">${apr.total.toFixed(1)}%</td></tr>`;
  }).join("");
  $("#topRows").innerHTML = top;
}
function drawChart() {
  const c = $("#volChart"); if (!c) return;
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = 240;
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  const P = [...ADADROME.POOLS].sort((a, b) => b.vol24h - a.vol24h);
  const max = P[0].vol24h, bw = w / P.length;
  P.forEach((p, i) => {
    const bh = (p.vol24h / max) * (h - 60);
    const g = x.createLinearGradient(0, h - 40 - bh, 0, h - 40);
    g.addColorStop(0, "#7c5cff"); g.addColorStop(1, "#2f6bff");
    x.fillStyle = g;
    const bx = i * bw + bw * 0.2, bwid = bw * 0.6;
    x.beginPath(); x.roundRect(bx, h - 40 - bh, bwid, bh, 6); x.fill();
    x.fillStyle = "#8b98bd"; x.font = "11px Inter, sans-serif"; x.textAlign = "center";
    x.fillText(p.t0 + "/" + p.t1, i * bw + bw / 2, h - 22);
    x.fillStyle = "#e8eefc"; x.font = "bold 11px Inter, sans-serif";
    x.fillText(ADADROME.fmtUSD(p.vol24h), i * bw + bw / 2, h - 44 - bh);
  });
}

/* ---------- init ---------- */
function init() {
  $$(".nav button").forEach(b => b.onclick = () => showView(b.dataset.view));
  $("#walletBtn").onclick = connectWallet;
  // swap
  $("#swapFromAmt").oninput = e => { state.swap.fromAmt = e.target.value; renderSwap(); };
  $("#swapFromBtn").onclick = () => openPicker("from");
  $("#swapToBtn").onclick = () => openPicker("to");
  $("#flipBtn").onclick = () => { const s = state.swap; [s.from, s.to] = [s.to, s.from]; s.fromAmt = ""; $("#swapFromAmt").value = ""; renderSwap(); };
  $("#swapBtn").onclick = doSwap;
  $("#slipSel").onchange = e => state.swap.slippage = +e.target.value;
  $("#tokList").onclick = e => {
    const it = e.target.closest("[data-sym]"); if (!it) return;
    const sym = it.dataset.sym, s = state.swap;
    if (s.picking === "from") { if (sym === s.to) s.to = s.from; s.from = sym; }
    else { if (sym === s.from) s.from = s.to; s.to = sym; }
    s.fromAmt = ""; $("#swapFromAmt").value = "";
    $("#pickerOverlay").classList.remove("open"); renderSwap();
  };
  $$(".overlay").forEach(o => o.addEventListener("click", e => { if (e.target === o) o.classList.remove("open"); }));
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const open = $$(".overlay.open");
    if (open.length) open[open.length - 1].classList.remove("open");
  });
  $("#pickerClose").onclick = () => $("#pickerOverlay").classList.remove("open");
  // liquidity
  $("#depA").oninput = depQuote;
  $("#depBtn").onclick = doDeposit;
  $("#depClose").onclick = () => $("#depOverlay").classList.remove("open");
  $$("#depOverlay [data-depmode]").forEach(b => b.onclick = () => setDepMode(b.dataset.depmode));
  $("#zapTok").onchange = renderZap;
  $("#zapAmt").oninput = renderZap;
  $("#zapBtn").onclick = doZap;
  // vote
  $("#lockWeeks").oninput = e => {
    $("#lockWeeksLbl").textContent = e.target.value + " weeks";
    const amt = parseFloat($("#lockAmt").value) || 0;
    $("#lockPowerPrev").textContent = ADADROME.fmtNum(amt * (e.target.value / ADADROME.MAX_LOCK_WEEKS)) + " veDROME";
  };
  $("#lockAmt").oninput = e => {
    const weeks = +$("#lockWeeks").value, amt = parseFloat(e.target.value) || 0;
    $("#lockPowerPrev").textContent = ADADROME.fmtNum(amt * (weeks / ADADROME.MAX_LOCK_WEEKS)) + " veDROME";
  };
  $("#lockBtn").onclick = doLock;
  $("#castBtn").onclick = castVotes;
  $("#claimBtn").onclick = claimRewards;
  // bribes
  $("#bribeBtn").onclick = doBribe;
  $("#bribeClose").onclick = () => $("#bribeOverlay").classList.remove("open");
  // concentrated liquidity
  $$("[data-liqtab]").forEach(b => b.onclick = () => showLiqTab(b.dataset.liqtab));
  $("#clDetailClose").onclick = () => $("#clDetailOverlay").classList.remove("open");
  $("#clAddClose").onclick = () => $("#clAddOverlay").classList.remove("open");
  $("#clA0").oninput = clRecalc;
  $("#clMinP").oninput = () => { clAdd.custom = true; clRecalc(); };
  $("#clMaxP").oninput = () => { clAdd.custom = true; clRecalc(); };
  $$("#clAddOverlay [data-preset]").forEach(b => b.onclick = () => clPreset(b.dataset.preset));
  $("#clMintBtn").onclick = mintCL;
  setInterval(() => { accrueCL(); save(); if (state.view === "liq") renderCL(); }, 20000);
  renderWallet(); tickEpoch(); renderSwap(); renderTxList();
  window.addEventListener("resize", () => { if (state.view === "dash") drawChart(); });
}
document.addEventListener("DOMContentLoaded", init);

/* ================= CONCENTRATED LIQUIDITY ================= */
function clPool(id) { return ADADROME.CLPOOLS.find(p => p.id === id); }
function clFeeApr(p) { return (p.vol24h * 365 * p.fee) / p.tvl * 100; }
function clPosValueUsd(pos, p) {
  const T = ADADROME.TOKENS;
  return pos.a0 * T[p.t0].price + pos.a1 * T[p.t1].price;
}
function clInRange(pos, p) {
  const tc = ADADROME.clTick(p);
  return tc >= pos.tickL && tc <= pos.tickU;
}
/* Fees accrue only while the position is in range — like real v3. */
function accrueCL() {
  const now = Date.now();
  state.clPositions.forEach(pos => {
    const p = clPool(pos.poolId); if (!p) return;
    const dt = Math.max(0, (now - (pos.lastAccrue || pos.created)) / 1000);
    if (dt > 0 && clInRange(pos, p)) {
      pos.feeUsd = (pos.feeUsd || 0) + dt / 86400 * clPosValueUsd(pos, p) * (clFeeApr(p) / 100);
    }
    pos.lastAccrue = now;
  });
}

function showLiqTab(which) {
  state.liqTab = which;
  $$("[data-liqtab]").forEach(b => b.classList.toggle("active", b.dataset.liqtab === which));
  $("#classicSection").style.display = which === "classic" ? "" : "none";
  $("#clSection").style.display = which === "cl" ? "" : "none";
  if (which === "cl") { accrueCL(); renderCL(); }
}

function renderCL() {
  accrueCL();
  const cards = ADADROME.CLPOOLS.map(p => {
    const my = state.clPositions.filter(x => x.poolId === p.id).length;
    return `<div class="card cl-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="pair">${tokIcon(p.t0)}${tokIcon(p.t1)} ${p.t0} / ${p.t1}</span>
        <span class="pill vol">concentrated · ${(p.fee * 100).toFixed(2)}%</span>
      </div>
      <div class="cl-stats">
        <div><span>Price</span><b>${fmtAmt(p.price, p.t1)} ${p.t1}</b></div>
        <div><span>TVL</span><b>${ADADROME.fmtUSD(p.tvl)}</b></div>
        <div><span>Fee APR</span><b class="apr">${clFeeApr(p).toFixed(1)}%</b></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn small ghost" data-cldetail="${p.id}" style="flex:1">Pool detail</button>
        <button class="btn small" data-clnew="${p.id}" style="flex:1">+ New position</button>
      </div>
      ${my ? `<div class="mut" style="margin-top:8px">${my} open position${my > 1 ? "s" : ""}</div>` : ""}
    </div>`;
  }).join("");
  $("#clPools").innerHTML = cards;
  $$("#clSection [data-cldetail]").forEach(b => b.onclick = () => openCLDetail(b.dataset.cldetail));
  $$("#clSection [data-clnew]").forEach(b => b.onclick = () => openCLAdd(b.dataset.clnew));

  const nfts = state.clPositions.map((pos, i) => {
    const p = clPool(pos.poolId);
    const inR = clInRange(pos, p);
    const minP = ADADROME.tickPrice(pos.tickL), maxP = ADADROME.tickPrice(pos.tickU);
    return `<div class="nft ${inR ? "" : "out"}">
      <div class="nft-head">
        <span class="pair">${tokIcon(p.t0)}${tokIcon(p.t1)} ${p.t0}/${p.t1}</span>
        <span class="pill ${inR ? "stable" : ""}" style="${inR ? "" : "background:rgba(248,113,113,.14);color:var(--red)"}">${inR ? "IN RANGE" : "OUT OF RANGE"}</span>
      </div>
      <div class="nft-id">Adadrome Position NFT #${pos.id}</div>
      <div class="nft-range">${fmtAmt(minP, p.t1)} – ${fmtAmt(maxP, p.t1)} ${p.t1} <span class="mut">per ${p.t0}</span></div>
      <div class="nft-rows">
        <div><span>Liquidity</span><b>${ADADROME.fmtNum(pos.L)}</b></div>
        <div><span>Deposited</span><b>${fmtAmt(pos.a0, p.t0)} ${p.t0} + ${fmtAmt(pos.a1, p.t1)} ${p.t1}</b></div>
        <div><span>Unclaimed fees</span><b class="apr">$${(pos.feeUsd || 0).toFixed(2)}</b></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn small ghost" data-clclaim="${i}" style="flex:1">Claim fees</button>
        <button class="btn small ghost" data-clremove="${i}" style="flex:1">Remove</button>
      </div>
    </div>`;
  }).join("");
  $("#clPositions").innerHTML = nfts || `<p class="mut">No concentrated positions yet — open one to earn boosted fees inside your price range.</p>`;
  $$("#clPositions [data-clclaim]").forEach(b => b.onclick = () => clClaim(+b.dataset.clclaim));
  $$("#clPositions [data-clremove]").forEach(b => b.onclick = () => clRemove(+b.dataset.clremove));
}

function clClaim(i) {
  const pos = state.clPositions[i], p = clPool(pos.poolId), T = ADADROME.TOKENS;
  accrueCL();
  if ((pos.feeUsd || 0) <= 0) return toast("No fees to claim yet.");
  const half = pos.feeUsd / 2;
  state.balances[p.t0] = (state.balances[p.t0] || 0) + half / T[p.t0].price;
  state.balances[p.t1] = (state.balances[p.t1] || 0) + half / T[p.t1].price;
  state.txs.unshift({ kind: "Claim CL fees", detail: `$${pos.feeUsd.toFixed(2)} from ${p.t0}/${p.t1} position`, t: Date.now() });
  pos.feeUsd = 0; save(); renderCL(); toast("Fees claimed (simulated).");
}
function clRemove(i) {
  const pos = state.clPositions[i], p = clPool(pos.poolId);
  accrueCL(); clClaimSilent(pos, p);
  state.balances[p.t0] = (state.balances[p.t0] || 0) + pos.a0;
  state.balances[p.t1] = (state.balances[p.t1] || 0) + pos.a1;
  state.txs.unshift({ kind: "Remove CL", detail: `${p.t0}/${p.t1} position #${pos.id} closed`, t: Date.now() });
  state.clPositions.splice(i, 1); save(); renderCL(); toast("Position removed, tokens returned (simulated).");
}
function clClaimSilent(pos, p) {
  const T = ADADROME.TOKENS, half = (pos.feeUsd || 0) / 2;
  if (half > 0) {
    state.balances[p.t0] = (state.balances[p.t0] || 0) + half / T[p.t0].price;
    state.balances[p.t1] = (state.balances[p.t1] || 0) + half / T[p.t1].price;
    pos.feeUsd = 0;
  }
}

/* ----- pool detail with liquidity depth chart ----- */
let clDetailId = null;
function openCLDetail(poolId) {
  clDetailId = poolId;
  const p = clPool(poolId);
  $("#clDetailTitle").textContent = `${p.t0} / ${p.t1} · concentrated`;
  $("#clDetailSub").textContent = `Fee tier ${(p.fee * 100).toFixed(2)}% · tick spacing ${p.spacing} · current tick ${ADADD_tick(p)}`;
  $("#clDetailOverlay").classList.add("open");
  requestAnimationFrame(() => drawDepth(p, null, "depthChart"));
}
function ADADD_tick(p) { return ADADROME.clTick(p); }
function drawDepth(p, range, canvasId) {
  const c = document.getElementById(canvasId || "depthChart"); if (!c) return;
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = 220;
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  const { tick, buckets } = ADADROME.clDepth(p);
  const max = Math.max(...buckets.map(b => b.liq));
  const bw = w / buckets.length;
  buckets.forEach((b, i) => {
    const bh = (b.liq / max) * (h - 56);
    const isCur = Math.abs(b.tick - tick) < p.spacing * 2;
    x.fillStyle = isCur ? "#fbbf24" : "rgba(124,92,255,.75)";
    x.beginPath(); x.roundRect(i * bw + 1, h - 36 - bh, bw - 2, bh, 3); x.fill();
  });
  // current price line
  const ci = buckets.findIndex(b => Math.abs(b.tick - tick) < p.spacing * 2);
  x.strokeStyle = "#fbbf24"; x.lineWidth = 2; x.setLineDash([5, 4]);
  x.beginPath(); x.moveTo(ci * bw + bw / 2, 8); x.lineTo(ci * bw + bw / 2, h - 30); x.stroke();
  x.setLineDash([]);
  // selected range shading
  if (range) {
    const x0 = buckets.findIndex(b => b.tick >= range[0]), x1 = buckets.findIndex(b => b.tick > range[1]);
    const xa = (x0 < 0 ? 0 : x0) * bw, xb = (x1 < 0 ? buckets.length : x1) * bw;
    x.fillStyle = "rgba(52,211,153,.14)"; x.fillRect(xa, 8, xb - xa, h - 38);
    x.strokeStyle = "#34d399"; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(xa, 8); x.lineTo(xa, h - 30); x.moveTo(xb, 8); x.lineTo(xb, h - 30); x.stroke();
  }
  x.fillStyle = "#8b98bd"; x.font = "11px Inter, sans-serif"; x.textAlign = "center";
  x.fillText(fmtAmt(buckets[0].price, p.t1), 40, h - 14);
  x.fillText(fmtAmt(buckets[buckets.length - 1].price, p.t1), w - 40, h - 14);
  x.fillStyle = "#fbbf24"; x.font = "bold 11px Inter, sans-serif";
  x.fillText("current: " + fmtAmt(p.price, p.t1) + " " + p.t1, ci * bw + bw / 2, 16);
}

/* ----- new concentrated position ----- */
const clAdd = { poolId: null, custom: false };
function openCLAdd(poolId) {
  if (!state.wallet) return toast("Connect a wallet first.");
  clAdd.poolId = poolId; clAdd.custom = false;
  const p = clPool(poolId);
  $("#clAddTitle").textContent = `New position · ${p.t0}/${p.t1}`;
  $("#clAddSub").textContent = `Current price ${fmtAmt(p.price, p.t1)} ${p.t1} per ${p.t0} · fee tier ${(p.fee * 100).toFixed(2)}%`;
  $("#clA0").value = ""; $("#clA0Bal").textContent = "Balance: " + fmtAmt(state.balances[p.t0] || 0, p.t0);
  clPreset("10");
  $("#clAddOverlay").classList.add("open");
}
function clPreset(kind) {
  const p = clPool(clAdd.poolId);
  clAdd.custom = kind === "custom";
  $$("#clAddOverlay [data-preset]").forEach(b => b.classList.toggle("active", b.dataset.preset === kind));
  let minP, maxP;
  if (kind === "full") { minP = ADADROME.tickPrice(-887272); maxP = ADADROME.tickPrice(887272); }
  else { const r = +kind / 100; minP = p.price * (1 - r); maxP = p.price * (1 + r); }
  $("#clMinP").value = minP < 0.0001 ? minP.toExponential(2) : minP.toFixed(6);
  $("#clMaxP").value = maxP > 1e9 ? maxP.toExponential(2) : maxP.toFixed(6);
  clRecalc();
}
function clRangeTicks() {
  const p = clPool(clAdd.poolId);
  const minP = parseFloat($("#clMinP").value), maxP = parseFloat($("#clMaxP").value);
  if (!minP || !maxP || minP <= 0 || maxP <= minP) return null;
  const q = Math.log(1.0001);
  const tickL = Math.floor(Math.log(minP) / q / p.spacing) * p.spacing;
  const tickU = Math.ceil(Math.log(maxP) / q / p.spacing) * p.spacing;
  return { tickL, tickU, minP: ADADROME.tickPrice(tickL), maxP: ADADROME.tickPrice(tickU) };
}
function clRecalc() {
  const p = clPool(clAdd.poolId); if (!p) return;
  const r = clRangeTicks(), a0 = parseFloat($("#clA0").value);
  const box = $("#clCalcBox");
  if (!r) { box.innerHTML = `<p class="mut">Enter a valid min/max price.</p>`; $("#clMintBtn").disabled = true; return; }
  const sqrtP = Math.sqrt(p.price), sqrtA = Math.sqrt(r.minP), sqrtB = Math.sqrt(r.maxP);
  const inR = sqrtP >= sqrtA && sqrtP <= sqrtB;
  let L = 0, needA1 = 0, note = "";
  if (a0 > 0) {
    if (sqrtP <= sqrtA) { L = ADADROME.CLM.liqForA0(sqrtA, sqrtB, a0); note = `Price below range — position will hold only ${p.t0}.`; }
    else if (sqrtP >= sqrtB) { needA1 = a0 * p.price; L = ADADROME.CLM.liqForA1(sqrtA, sqrtB, needA1); note = `Price above range — position will hold only ${p.t1} (≈${fmtAmt(needA1, p.t1)}).`; }
    else { L = ADADROME.CLM.liqForA0InRange(sqrtP, sqrtB, a0); [, needA1] = ADADROME.CLM.amountsForLiq(sqrtP, sqrtA, sqrtB, L); }
  }
  const boost = r.maxP / r.minP;
  const boostLbl = boost > 1e9 ? "maximum (full range)" : `~${boost < 10 ? boost.toFixed(1) : ADADROME.fmtNum(boost)}× vs full range`;
  box.innerHTML = `
    <div class="qr"><span>Range</span><b>${fmtAmt(r.minP, p.t1)} – ${fmtAmt(r.maxP, p.t1)} ${p.t1}</b></div>
    <div class="qr"><span>Status</span><b class="${inR ? "" : "warn"}" style="${inR ? "color:var(--green)" : ""}">${inR ? "In range — earning fees" : "Out of range — single-sided"}</b></div>
    <div class="qr"><span>Required ${p.t1}</span><b>${fmtAmt(needA1, p.t1)} ${p.t1}</b></div>
    <div class="qr"><span>Liquidity</span><b>${ADADROME.fmtNum(L)}</b></div>
    <div class="qr"><span>Capital efficiency</span><b>${boostLbl}</b></div>
    ${note ? `<div class="qr"><span></span><b class="warn">${note}</b></div>` : ""}`;
  $("#clMintBtn").disabled = !(a0 > 0 && L > 0);
  clAdd.calc = { r, L, needA1, a0 };
  requestAnimationFrame(() => drawDepth(p, [r.tickL, r.tickU], "clRangeChart"));
}
function mintCL() {
  const p = clPool(clAdd.poolId), c = clAdd.calc;
  if (!c) return;
  if ((state.balances[p.t0] || 0) < c.a0) return toast("Insufficient " + p.t0 + " balance.");
  if ((state.balances[p.t1] || 0) < c.needA1) return toast(`Need ${fmtAmt(c.needA1, p.t1)} ${p.t1} for this range.`);
  state.balances[p.t0] -= c.a0; state.balances[p.t1] -= c.needA1;
  const id = 1000 + state.clPositions.length + Math.floor(Math.random() * 3);
  state.clPositions.push({ id, poolId: p.id, tickL: c.r.tickL, tickU: c.r.tickU, L: c.L, a0: c.a0, a1: c.needA1, created: Date.now(), feeUsd: 0, lastAccrue: Date.now() });
  state.txs.unshift({ kind: "Mint CL NFT", detail: `#${id} ${p.t0}/${p.t1} L=${ADADROME.fmtNum(c.L)}`, t: Date.now() });
  $("#clAddOverlay").classList.remove("open");
  save(); showLiqTab("cl"); renderTxList();
  toast(`Position NFT #${id} minted (simulated).`);
}
