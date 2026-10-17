// MSOP Hosting — node proxy (Vercel serverless).
// Forwards the browser's request to the user's own MSOP Panel node,
// so the https site can talk to an http VPS without mixed-content issues.
//
//   /api/node?target=/api/servers/1/console&since=123
//   Headers: x-node-url, x-node-token
const { Readable } = require("stream");

function buildTarget(nodeUrl, target, query) {
  const base = nodeUrl.replace(/\/+$/, "");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (k === "target") continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, v);
  }
  const q = qs.toString();
  return base + target + (q ? (target.includes("?") ? "&" : "?") + q : "");
}

module.exports = async (req, res) => {
  const nodeUrl = req.headers["x-node-url"];
  const token = req.headers["x-node-token"];
  const target = req.query.target;

  if (!nodeUrl || !token || !target) {
    return res.status(400).json({ error: "Missing node URL, token, or target" });
  }
  if (!/^https?:\/\//i.test(nodeUrl) || !target.startsWith("/api/")) {
    return res.status(400).json({ error: "Bad node URL or target" });
  }
  // basic SSRF guard: never proxy to cloud metadata or localhost internals
  if (/^(https?:\/\/)?(169\.254\.169\.254|metadata\.google)/i.test(nodeUrl)) {
    return res.status(400).json({ error: "Blocked target" });
  }

  const url = buildTarget(nodeUrl, target, req.query);
  const headers = { Authorization: `Bearer ${token}` };
  const ct = req.headers["content-type"];
  if (ct) headers["content-type"] = ct;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: "half",
    });
  } catch (e) {
    return res.status(502).json({ error: "Node unreachable" });
  }

  res.status(upstream.status);
  upstream.headers.forEach((v, k) => {
    if (!["content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
      res.setHeader(k, v);
    }
  });
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
  else res.end();
};
