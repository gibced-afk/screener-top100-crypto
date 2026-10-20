const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// ====================== CONFIG ======================
const DISCORD_WEBHOOK = "https://discordapp.com/api/webhooks/1561976328578662423/U8jUjktHzaVe_uGHc19IQa5dg3JoehUZcQUgXlK2TzzbH6-BRl7b-ywe3fag_fCY-Dpy";
const REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
let coinsData = [];
let previousStatus = {};
let changeHistory = [];
let isRateLimited = false;

// ====================== SIGNAL ======================
function getSignal(change) {
  if (change >= 4.5) return { type: 'buy', label: 'Achat fort' };
  if (change >= 2.2) return { type: 'buy', label: 'Achat' };
  if (change <= -4.5) return { type: 'sell', label: 'Éviter fort' };
  if (change <= -2.2) return { type: 'sell', label: 'Éviter' };
  return { type: 'neutral', label: 'Neutre' };
}

// ====================== DISCORD ======================
async function sendDiscordAlert(crypto, from, to) {
  const colors = { buy: 0x10b981, neutral: 0xf59e0b, sell: 0xef4444 };
  const labels = { buy: 'Achat', neutral: 'Neutre', sell: 'Éviter' };

  const payload = {
    embeds: [{
      title: "🔔 Screener Top 100 - Changement",
      description: `**${crypto}** est passé de **${labels[from]}** → **${labels[to]}**`,
      color: colors[to],
      timestamp: new Date().toISOString(),
      footer: { text: "Screener Top 100 • Render" }
    }]
  };

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`Alerte Discord : ${crypto} ${from} → ${to}`);
  } catch (err) {
    console.error('Erreur Discord:', err.message);
  }
}

// ====================== CHECK ======================
async function checkTop100() {
  if (isRateLimited) {
    console.log('⏳ Rate limit actif, on attend...');
    return;
  }

  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false';
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CryptoScreener/1.0' }
    });

    if (response.status === 429) {
      console.log('⚠️ 429 Rate limit - pause 12 minutes');
      isRateLimited = true;
      setTimeout(() => {
        isRateLimited = false;
        console.log('✅ Rate limit levé');
      }, 12 * 60 * 1000);
      return;
    }

    if (!response.ok) throw new Error(`API ${response.status}`);

    const data = await response.json();
    const newStatus = {};
    const now = Date.now();

    data.forEach(coin => {
      const change = coin.price_change_percentage_24h || 0;
      const signal = getSignal(change);
      const id = coin.id;
      const symbol = coin.symbol.toUpperCase();

      if (previousStatus[id] && previousStatus[id] !== signal.type) {
        const entry = {
          symbol,
          from: previousStatus[id],
          to: signal.type,
          time: new Date().toLocaleTimeString('fr-FR'),
          timestamp: now
        };
        changeHistory.unshift(entry);
        if (changeHistory.length > 10) changeHistory.pop();

        sendDiscordAlert(symbol, previousStatus[id], signal.type);
      }

      newStatus[id] = signal.type;
      coin.signal = signal.type;
      coin.signalLabel = signal.label;
      coin.lastChange = previousStatus[id] !== signal.type ? now : (coin.lastChange || 0);
    });

    previousStatus = newStatus;
    coinsData = data;
    console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ✅ Top 100 mis à jour`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// ====================== API + FRONTEND ======================
app.get('/api/data', (req, res) => {
  res.json({
    coins: coinsData,
    history: changeHistory,
    updatedAt: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screener Top 100 Cryptos</title>
  <style>
    :root {
      --bg: #0b0f19; --card: #141b2d; --border: #1e293b; --text: #e2e8f0; --muted: #94a3b8;
      --green: #10b981; --yellow: #f59e0b; --red: #ef4444;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background:var(--bg); color:var(--text); min-height:100vh; }
    .container { max-width:1200px; margin:0 auto; padding:25px 18px 50px; }
    header { text-align:center; margin-bottom:25px; }
    h1 { font-size:1.9rem; background:linear-gradient(90deg,#3b82f6,#10b981); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    .subtitle { color:var(--muted); font-size:0.95rem; margin-top:4px; }
    .filters { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin:22px 0; }
    .filter-btn { background:var(--card); border:1px solid var(--border); color:var(--text); padding:8px 18px; border-radius:50px; cursor:pointer; font-size:0.9rem; transition:0.2s; }
    .filter-btn:hover, .filter-btn.active { background:#3b82f6; border-color:#3b82f6; }
    .status { text-align:center; color:var(--muted); font-size:0.9rem; margin-bottom:18px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px; margin-bottom:35px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px; position:relative; transition:0.2s; }
    .card:hover { transform:translateY(-3px); }
    .card.buy { border-left:5px solid var(--green); }
    .card.neutral { border-left:5px solid var(--yellow); }
    .card.sell { border-left:5px solid var(--red); }
    .rank { position:absolute; top:10px; right:12px; font-size:0.75rem; color:var(--muted); }
    .card-header { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .crypto-img { width:30px; height:30px; border-radius:50%; }
    .name { font-weight:700; font-size:1rem; }
    .symbol { font-size:0.78rem; color:var(--muted); }
    .badge { font-size:0.68rem; font-weight:700; padding:3px 9px; border-radius:50px; text-transform:uppercase; display:inline-block; margin-top:3px; }
    .badge.buy { background:var(--green); color:#022c22; }
    .badge.neutral { background:var(--yellow); color:#451a03; }
    .badge.sell { background:var(--red); color:#450a0a; }
    .price { font-size:1.25rem; font-weight:600; margin:6px 0 2px; }
    .change { font-size:0.9rem; }
    .change.positive { color:var(--green); }
    .change.negative { color:var(--red); }
    .history-box { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px 20px; }
    .history-box h3 { font-size:1.05rem; margin-bottom:12px; }
    .history-list { list-style:none; font-size:0.88rem; }
    .history-list li { padding:7px 0; border-bottom:1px solid var(--border); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
    .history-list li:last-child { border-bottom:none; }
    .tag { font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:50px; text-transform:uppercase; }
    .tag.buy { background:var(--green); color:#022c22; }
    .tag.neutral { background:var(--yellow); color:#451a03; }
    .tag.sell { background:var(--red); color:#450a0a; }
    .history-time { color:var(--muted); font-size:0.8rem; margin-left:auto; }
    @media(max-width:600px){ .grid{grid-template-columns:1fr;} h1{font-size:1.5rem;} }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Screener Top 100</h1>
      <p class="subtitle">Priorité Vert → Jaune → Rouge • Filtres + Historique</p>
    </header>

    <div class="filters">
      <button class="filter-btn active" data-filter="all">Tous</button>
      <button class="filter-btn" data-filter="buy">Vert uniquement</button>
      <button class="filter-btn" data-filter="neutral">Jaune uniquement</button>
      <button class="filter-btn" data-filter="sell">Rouge uniquement</button>
    </div>

    <div class="status" id="status">Chargement...</div>
    <div class="grid" id="grid"></div>

    <div class="history-box">
      <h3>10 derniers changements</h3>
      <ul class="history-list" id="history"></ul>
    </div>
  </div>

  <script>
    let allCoins = [];
    let currentFilter = 'all';

    function playSound(type) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'buy') {
          osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        } else if (type === 'neutral') {
          osc.type = 'triangle'; osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        } else {
          osc.type = 'sawtooth'; osc.frequency.setValueAtTime(220, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.3);
          gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        }
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch(e){}
    }

    function render() {
      let list = [...allCoins];

      if (currentFilter !== 'all') {
        list = list.filter(c => c.signal === currentFilter);
        list.sort((a, b) => (b.lastChange || 0) - (a.lastChange || 0));
      } else {
        const order = { buy: 0, neutral: 1, sell: 2 };
        list.sort((a, b) => order[a.signal] - order[b.signal]);
      }

      const grid = document.getElementById('grid');
      grid.innerHTML = list.map((coin, i) => \`
        <div class="card \${coin.signal}">
          <div class="rank">#\${coin.market_cap_rank || i+1}</div>
          <div class="card-header">
            <img src="\${coin.image}" class="crypto-img" loading="lazy">
            <div>
              <div class="name">\${coin.name}</div>
              <div class="symbol">\${coin.symbol.toUpperCase()}</div>
            </div>
          </div>
          <span class="badge \${coin.signal}">\${coin.signalLabel}</span>
          <div class="price">$\${Number(coin.current_price).toLocaleString('en-US', {maximumFractionDigits: coin.current_price < 1 ? 4 : 2})}</div>
          <div class="change \${(coin.price_change_percentage_24h||0) >= 0 ? 'positive' : 'negative'}">
            \${(coin.price_change_percentage_24h||0) >= 0 ? '+' : ''}\${(coin.price_change_percentage_24h||0).toFixed(2)}%
          </div>
        </div>
      \`).join('');
    }

    function renderHistory(history) {
      const el = document.getElementById('history');
      if (!history || history.length === 0) {
        el.innerHTML = '<li style="color:var(--muted)">Aucun changement récent</li>';
        return;
      }
      el.innerHTML = history.map(h => \`
        <li>
          <strong>\${h.symbol}</strong>
          <span class="tag \${h.from}">\${h.from === 'buy' ? 'Achat' : h.from === 'sell' ? 'Éviter' : 'Neutre'}</span>
          →
          <span class="tag \${h.to}">\${h.to === 'buy' ? 'Achat' : h.to === 'sell' ? 'Éviter' : 'Neutre'}</span>
          <span class="history-time">\${h.time}</span>
        </li>
      \`).join('');
    }

    async function loadData() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        allCoins = data.coins || [];
        render();
        renderHistory(data.history || []);
        document.getElementById('status').textContent = 'Dernière mise à jour : ' + new Date(data.updatedAt).toLocaleTimeString('fr-FR');
      } catch (e) {
        document.getElementById('status').textContent = 'Erreur de chargement';
      }
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        render();
      });
    });

    loadData();
    setInterval(loadData, 30000);
  </script>
</body>
</html>`);
});

// ====================== START ======================
app.listen(PORT, () => {
  console.log(`🚀 Screener Top 100 démarré sur le port ${PORT}`);
  setTimeout(checkTop100, 4000);
  setInterval(checkTop100, REFRESH_INTERVAL);
});
