// MSOP Hosting — panel dashboard.
import {
  USER, NODE, requireLogin, paintUser, toast, openModal, esc, pillClass,
  loadNodes, saveNode, deleteNode, setNode, clearNodeSel, nodeApi,
} from "/js/panel-common.js";

let nodes = [];
let versionCache = {};

init();
async function init() {
  await requireLogin();
  paintUser();
  nodes = await loadNodes().catch(() => []);
  const saved = localStorage.getItem("msophost_node");
  const sel = nodes.find((n) => n.id === saved) || nodes[0] || null;
  setNode(sel);
  renderNodes();
  if (!sel) { showNoNodes(); return; }
  showDash();
  loadServers();
  setInterval(() => { if (NODE) loadServers(); }, 10000);
  wireCreate();
  document.getElementById("nodeSettingsBtn").onclick = nodeSettings;
}
document.getElementById("connectBtn").onclick = () => openModal("nodeModal");
document.getElementById("connectBtn2").onclick = () => openModal("nodeModal");

function showNoNodes() {
  document.getElementById("noNodes").style.display = "";
  document.getElementById("dashView").style.display = "none";
  document.getElementById("nodeBar").style.display = "none";
}
function showDash() {
  document.getElementById("noNodes").style.display = "none";
  document.getElementById("dashView").style.display = "";
  document.getElementById("nodeBar").style.display = nodes.length ? "" : "none";
  document.getElementById("dashTitle").textContent = "Servers";
  document.getElementById("dashSub").textContent = NODE ? `on ${NODE.name} (${NODE.url})` : "";
}

function renderNodes() {
  const box = document.getElementById("nodePills");
  box.innerHTML = "";
  for (const n of nodes) {
    const b = document.createElement("button");
    b.className = "nodepill" + (NODE && n.id === NODE.id ? " active" : "");
    b.innerHTML = `<span class="dot"></span>${esc(n.name)}`;
    b.onclick = () => { setNode(n); renderNodes(); showDash(); loadServers(); };
    box.appendChild(b);
  }
}

async function nodeSettings() {
  const name = prompt("Rename node (leave empty to keep):", NODE.name);
  if (name === null) return;
  if (name.trim() && name.trim() !== NODE.name) {
    toast("Rename coming right up — for now, delete and re-add the node.", "");
    return;
  }
  if (confirm(`Remove node "${NODE.name}" from your account? (Your VPS is untouched.)`)) {
    await deleteNode(NODE.id);
    nodes = nodes.filter((n) => n.id !== NODE.id);
    clearNodeSel();
    setNode(nodes[0] || null);
    renderNodes();
    nodes.length ? (showDash(), loadServers()) : showNoNodes();
  }
}

async function loadServers() {
  const grid = document.getElementById("serverGrid");
  const r = await nodeApi("/api/servers").catch(() => ({ ok: false }));
  if (!r.ok) {
    grid.innerHTML = `<div class="empty"><h3>Couldn't reach your node</h3><p>${esc(r.data?.error || "Check that your VPS is online.")}</p></div>`;
    document.getElementById("emptyState").style.display = "none";
    return;
  }
  const list = r.data.servers || [];
  document.getElementById("emptyState").style.display = list.length ? "none" : "";
  grid.innerHTML = list.map((s) => `
    <div class="card">
      <div class="srv-top">
        <span class="srv-name">${esc(s.name)}</span>
        <span class="pill ${pillClass(s.status)}"><span class="dot"></span>${esc(s.status.replace("_", " "))}</span>
      </div>
      <div class="srv-meta">
        <span class="chip">${s.type === "paper" ? "Paper" : "Vanilla"} ${esc(s.version)}</span>
        <span>Port <b>${s.port}</b></span>
        <span><b>${(s.memory_mb / 1024).toFixed(s.memory_mb % 1024 ? 1 : 0)} GB</b> RAM</span>
      </div>
      <div class="srv-actions">
        <a class="btn btn-primary btn-sm" href="/panel/server.html?node=${NODE.id}&id=${s.id}">Manage →</a>
      </div>
    </div>`).join("");
}

// ---- connect node ----
document.getElementById("testNodeBtn").onclick = async () => {
  const url = document.getElementById("nUrl").value.trim().replace(/\/$/, "");
  const token = document.getElementById("nToken").value.trim();
  const errBox = document.getElementById("nodeErr");
  errBox.style.display = "none";
  if (!url || !token) { errBox.textContent = "Paste the node URL and API token."; errBox.style.display = "block"; return; }
  const headers = { "x-node-url": url, "x-node-token": token };
  try {
    const res = await fetch("/api/node?target=" + encodeURIComponent("/api/health"), { headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.panel) { toast(`Connected — ${data.panel} (java: ${data.java ? "yes" : "no"})`, "ok"); }
    else { errBox.textContent = data.error || "Node rejected the token."; errBox.style.display = "block"; }
  } catch { errBox.textContent = "Could not reach that URL."; errBox.style.display = "block"; }
};

document.getElementById("saveNodeBtn").onclick = async () => {
  const name = document.getElementById("nName").value.trim() || "My node";
  const url = document.getElementById("nUrl").value.trim().replace(/\/$/, "");
  const token = document.getElementById("nToken").value.trim();
  if (!url || !token) { toast("Paste the node URL and API token.", "err"); return; }
  const id = await saveNode({ name, url, token });
  nodes = await loadNodes();
  setNode(nodes.find((n) => n.id === id));
  document.getElementById("nName").value = "";
  document.getElementById("nUrl").value = "";
  document.getElementById("nToken").value = "";
  const { closeModal } = await import("/js/panel-common.js");
  closeModal("nodeModal");
  toast("Node connected", "ok");
  renderNodes(); showDash(); loadServers();
};

// ---- create server ----
async function loadVersions(type) {
  if (versionCache[type]) return versionCache[type];
  const r = await nodeApi("/api/versions?type=" + type);
  if (!r.ok) throw new Error(r.data.error || "Could not load versions");
  versionCache[type] = r.data.versions;
  return versionCache[type];
}
async function fillVersions() {
  const type = document.getElementById("fType").value;
  const sel = document.getElementById("fVersion");
  sel.innerHTML = "<option>Loading…</option>";
  try {
    const vs = await loadVersions(type);
    sel.innerHTML = vs.map((v, i) => `<option value="${esc(v)}"${i === 0 ? " selected" : ""}>${esc(v)}${i === 0 ? " (latest)" : ""}</option>`).join("");
  } catch (e) { sel.innerHTML = `<option value="">${esc(e.message)}</option>`; }
}
function wireCreate() {
  document.getElementById("createBtn").onclick = () => { fillVersions(); openModal("createModal"); };
  document.getElementById("fType").onchange = fillVersions;
  document.getElementById("doCreate").onclick = async () => {
    const btn = document.getElementById("doCreate");
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      const r = await nodeApi("/api/servers", {
        method: "POST",
        body: {
          name: document.getElementById("fName").value.trim(),
          type: document.getElementById("fType").value,
          version: document.getElementById("fVersion").value,
          memoryMB: parseInt(document.getElementById("fMem").value, 10),
        },
      });
      if (!r.ok) throw new Error(r.data.error || "Create failed");
      const { closeModal } = await import("/js/panel-common.js");
      closeModal("createModal");
      document.getElementById("fName").value = "";
      location.href = `/panel/server.html?node=${NODE.id}&id=${r.data.server.id}`;
    } catch (e) { toast(e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "Create Server"; }
  };
}
