// Backend status: a tiny ping endpoint for an external cron job (keeps a free Render instance awake) and a
// self-refreshing page that shows whether the backend has stayed up. Nothing here exposes secrets: the
// Gemini key is reported only as configured or not, and pings record a time and user agent, never an IP.
import { config } from "./config.js";

const startedAt = Date.now();
const MAX_PINGS = 60;

const stats = {
  requests: 0,
  pings: 0,
  tokensIssued: 0,
  tokenErrors: 0,
  rateLimited: 0,
  recentPings: [] as { at: number; method: string; agent: string }[],
};

export function countRequest() {
  stats.requests++;
}

export function countToken(outcome: "ok" | "error" | "limited") {
  if (outcome === "ok") stats.tokensIssued++;
  else if (outcome === "error") stats.tokenErrors++;
  else stats.rateLimited++;
}

export function recordPing(method: string, userAgent: string | undefined) {
  stats.pings++;
  stats.recentPings.unshift({ at: Date.now(), method, agent: (userAgent ?? "unknown").slice(0, 120) });
  stats.recentPings.length = Math.min(stats.recentPings.length, MAX_PINGS);
}

export function statusSnapshot() {
  const now = Date.now();
  const mem = process.memoryUsage();
  const lastMinute = stats.recentPings.filter((p) => now - p.at < 60_000).length;
  return {
    ok: true,
    now: new Date(now).toISOString(),
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    voiceConfigured: Boolean(config.geminiApiKey),
    model: config.liveModel,
    voice: config.voice,
    publicUrl: config.publicUrl || null,
    allowedOrigins: config.allowedOrigins,
    node: process.version,
    memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    deploy: {
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      branch: process.env.RENDER_GIT_BRANCH ?? null,
      instance: process.env.RENDER_INSTANCE_ID ?? null,
      service: process.env.RENDER_SERVICE_NAME ?? null,
    },
    counters: {
      requests: stats.requests,
      pings: stats.pings,
      pingsLastMinute: lastMinute,
      tokensIssued: stats.tokensIssued,
      tokenErrors: stats.tokenErrors,
      rateLimited: stats.rateLimited,
    },
    lastPingAt: stats.recentPings[0] ? new Date(stats.recentPings[0].at).toISOString() : null,
    recentPings: stats.recentPings.slice(0, 15).map((p) => ({ at: new Date(p.at).toISOString(), method: p.method, agent: p.agent })),
  };
}

/** The status page. Server-rendered shell; the numbers fill in from /api/status and refresh every 10 s. */
export function statusPage(): string {
  const pingUrl = `${config.publicUrl || ""}/api/ping`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Tekkie Backend Status</title>
<link rel="icon" href="/brand/tekkie-mark.svg" type="image/svg+xml" />
<style>
  :root { --bg:#f6f6f6; --surface:#fff; --fg:#191919; --muted:#4a4a4a; --muted-2:#7b7b7b; --line:#e1e1e1; --line-2:#f1f1f1;
    --primary:#ff5c00; --tint:#fff2eb; --tint-2:#ffdecc; --ok:#16803c; --ok-tint:#e8f5ec; --warn:#a15c00; --warn-tint:#fff4e0; --err:#d92d20; --err-tint:#fdecea;
    --shadow:0px 6px 24px -3px #1a1a1a21, 0px 1px 2px -4px #1a1a1a21; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1d1d1d; --surface:#2c2c2c; --fg:#f1f1f1; --muted:#b8b8b8; --muted-2:#949494; --line:#3a3a3a; --line-2:#333;
    --tint:#3a2a22; --tint-2:#5a3a2a; --ok:#4fd18f; --ok-tint:#1f3a2a; --warn:#ffb44d; --warn-tint:#3a2f1c; --err:#ff8a80; --err-tint:#3a2222; --shadow:0px 6px 24px -3px #00000066; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: -0.01em; }
  main { width: min(1040px, 100% - 32px); margin: 0 auto; padding: 32px 0 56px; }
  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  header img { width: 36px; height: 36px; }
  h1 { font-size: 24px; margin: 0; letter-spacing: -0.03em; }
  .pill { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; font-weight: 600; font-size: 14px; border: 1px solid transparent; }
  .pill .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 22%, transparent); }
  .pill.ok { color: var(--ok); background: var(--ok-tint); } .pill.warn { color: var(--warn); background: var(--warn-tint); } .pill.err { color: var(--err); background: var(--err-tint); }
  .sub { color: var(--muted); margin: 8px 0 24px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; box-shadow: var(--shadow); min-width: 0; }
  .card .k { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-2); }
  .card .v { font-size: 24px; font-weight: 650; letter-spacing: -0.03em; margin-top: 10px; overflow-wrap: anywhere; }
  .card .s { color: var(--muted); font-size: 13px; margin-top: 4px; overflow-wrap: anywhere; }
  .row { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; margin-top: 14px; }
  h2 { font-size: 16px; margin: 0 0 12px; letter-spacing: -0.02em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line-2); vertical-align: top; }
  th { color: var(--muted-2); font-weight: 600; font-size: 12px; }
  td.agent { color: var(--muted); overflow-wrap: anywhere; }
  .empty { color: var(--muted-2); padding: 14px 6px; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
  .url { display: flex; gap: 8px; align-items: center; background: var(--tint); border: 1px solid var(--tint-2); border-radius: 10px; padding: 8px 8px 8px 12px; }
  .url code { flex: 1; overflow-wrap: anywhere; }
  button { font: inherit; font-size: 13px; font-weight: 600; border: 0; border-radius: 8px; padding: 7px 12px; background: var(--primary); color: #fff; cursor: pointer; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 14px 0 0; font-size: 14px; }
  dt { color: var(--muted-2); } dd { margin: 0; overflow-wrap: anywhere; }
  .note { color: var(--muted); font-size: 13px; margin-top: 12px; }
  footer { margin-top: 20px; color: var(--muted-2); font-size: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
  footer a { color: inherit; }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr 1fr; } .row { grid-template-columns: 1fr; } }
  @media (max-width: 420px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <header>
    <img src="/brand/tekkie-mark.svg" alt="" />
    <h1>Tekkie backend</h1>
    <span class="pill warn" id="pill"><span class="dot"></span><span id="pill-text">Checking</span></span>
  </header>
  <p class="sub" id="sub">Voice-token API, website and extension download, on one service.</p>

  <section class="grid" aria-label="Key numbers">
    <div class="card"><div class="k">Awake for</div><div class="v" id="uptime">-</div><div class="s" id="started">-</div></div>
    <div class="card"><div class="k">Last ping</div><div class="v" id="last-ping">-</div><div class="s" id="ping-rate">-</div></div>
    <div class="card"><div class="k">Voice sessions</div><div class="v" id="tokens">-</div><div class="s" id="token-sub">-</div></div>
    <div class="card"><div class="k">Memory</div><div class="v" id="memory">-</div><div class="s" id="requests">-</div></div>
  </section>

  <section class="row">
    <div class="card">
      <h2>Recent pings</h2>
      <table>
        <thead><tr><th>When</th><th>Method</th><th>From</th></tr></thead>
        <tbody id="pings"><tr><td colspan="3" class="empty">No pings since this instance woke up.</td></tr></tbody>
      </table>
    </div>
    <div class="card">
      <h2>Keep-awake cron</h2>
      <div class="url"><code id="ping-url">${pingUrl}</code><button type="button" id="copy">Copy</button></div>
      <dl>
        <dt>Method</dt><dd>GET (HEAD also works)</dd>
        <dt>Schedule</dt><dd>Every 1 minute</dd>
        <dt>Expect</dt><dd>HTTP 200, body <code>pong</code></dd>
      </dl>
      <p class="note">Free instances sleep after 15 minutes without traffic. If "Awake for" keeps growing and pings arrive every minute, the cron is working. A reset to a few seconds means the instance restarted: a deploy, a crash, or it slept.</p>
      <dl id="details"></dl>
    </div>
  </section>

  <footer>
    <span id="updated">-</span>
    <a href="/api/status">JSON</a>
    <a href="/">Website</a>
  </footer>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const fmtDur = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return d ? d + "d " + h + "h" : h ? h + "h " + m + "m" : m ? m + "m " + sec + "s" : sec + "s";
  };
  const ago = (iso) => fmtDur(Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))) + " ago";
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  async function refresh() {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const s = await r.json();
      const sinceLast = s.lastPingAt ? (Date.now() - Date.parse(s.lastPingAt)) / 1000 : null;
      const pill = $("pill");
      if (!s.voiceConfigured) { pill.className = "pill warn"; $("pill-text").textContent = "Live, voice off"; $("sub").textContent = "Running, but GEMINI_API_KEY is not set, so voice sessions will fail."; }
      else if (sinceLast !== null && sinceLast > 150) { pill.className = "pill warn"; $("pill-text").textContent = "Live, pings late"; $("sub").textContent = "Running and ready for voice. No ping for over two minutes: check the cron job."; }
      else { pill.className = "pill ok"; $("pill-text").textContent = "Live"; $("sub").textContent = "Running and ready for voice."; }
      $("uptime").textContent = fmtDur(s.uptimeSeconds);
      $("started").textContent = "since " + new Date(s.startedAt).toLocaleString();
      $("last-ping").textContent = s.lastPingAt ? ago(s.lastPingAt) : "none yet";
      $("ping-rate").textContent = s.counters.pingsLastMinute + " in the last minute · " + s.counters.pings + " since wake";
      $("tokens").textContent = s.counters.tokensIssued;
      $("token-sub").textContent = s.counters.tokenErrors + " failed · " + s.counters.rateLimited + " rate-limited";
      $("memory").textContent = s.memoryMb.rss + " MB";
      $("requests").textContent = s.counters.requests + " requests since wake";
      $("pings").innerHTML = s.recentPings.length
        ? s.recentPings.map((p) => "<tr><td>" + esc(ago(p.at)) + "</td><td class='mono'>" + esc(p.method) + "</td><td class='agent'>" + esc(p.agent) + "</td></tr>").join("")
        : "<tr><td colspan='3' class='empty'>No pings since this instance woke up.</td></tr>";
      const rows = [
        ["Model", s.model + " · " + s.voice],
        ["Node", s.node],
        ["Deploy", [s.deploy.branch, s.deploy.commit].filter(Boolean).join(" @ ") || "local"],
        ["Allowed", s.allowedOrigins.length ? s.allowedOrigins.join(", ") : "dev mode (localhost)"],
      ];
      $("details").innerHTML = rows.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("");
      $("updated").textContent = "Updated " + new Date().toLocaleTimeString() + " · refreshes every 10 s";
    } catch {
      $("pill").className = "pill err"; $("pill-text").textContent = "Unreachable";
      $("updated").textContent = "Could not reach the backend at " + new Date().toLocaleTimeString();
    }
  }
  $("copy").addEventListener("click", async () => {
    const url = $("ping-url").textContent.startsWith("/") ? location.origin + $("ping-url").textContent : $("ping-url").textContent;
    try { await navigator.clipboard.writeText(url); $("copy").textContent = "Copied"; setTimeout(() => ($("copy").textContent = "Copy"), 1400); } catch {}
  });
  refresh();
  setInterval(refresh, 10000);
</script>
</body>
</html>`;
}
