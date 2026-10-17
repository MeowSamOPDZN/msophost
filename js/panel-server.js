// MSOP Hosting — server page (polls the node through the proxy).
import {
  requireLogin, paintUser, toast, openModal, closeModal, esc,
  fmtBytes, fmtDate, fmtUptime, pillClass,
  loadNodes, setNode, nodeApi, nodeDownload, NODE,
} from "/js/panel-common.js";

const qs = new URLSearchParams(location.search);
const NODE_ID = qs.get("node");
const SERVER_ID = qs.get("id");
let SERVER = null;
let curPath = "/";
let lastConsoleT = 0;

init();
async function init() {
  if (!NODE_ID || !SERVER_ID) { location.href = "/panel/"; return; }
  await requireLogin();
  paintUser();
  const nodes = await loadNodes().catch(() => []);
  const node = nodes.find((n) => n.id === NODE_ID);
  if (!node) { toast("Node not found", "err"); location.href = "/panel/"; return; }
  setNode(node);
  await refreshServer();
  wireTabs(); wirePower(); wireConsole(); wireFiles(); wireSettings();
  pollConsole(); pollStats();
  setInterval(pollConsole, 2500);
  setInterval(pollStats, 3000);
  setInterval(refreshServer, 15000);
}

async function refreshServer() {
  const r = await nodeApi(`/api/servers/${SERVER_ID}`).catch(() => ({ ok: false }));
  if (!r.ok) { toast("Lost connection to node", "err"); return; }
  SERVER = r.data.server;
  document.title = `${SERVER.name} — MSOP Hosting`;
  document.getElementById("srvName").textContent = SERVER.name;
  document.getElementById("srvSub").textContent =
    `${SERVER.type === "paper" ? "Paper" : "Vanilla"} ${SERVER.version} · port ${SERVER.port} · ${(SERVER.memory_mb / 1024).toFixed(SERVER.memory_mb % 1024 ? 1 : 0)} GB RAM · via ${NODE.name}`;
  paintStatus(SERVER.status);
  document.getElementById("sName").value = SERVER.name;
  document.getElementById("sMem").value = String(SERVER.memory_mb);
  document.getElementById("sAutostart").checked = SERVER.autostart;
  const host = NODE.url.replace(/^https?:\/\//, "").split(":")[0];
  document.getElementById("sAddr").value = `${host}:${SERVER.port}`;
  if (SERVER.status === "installing") {
    document.getElementById("installBanner").classList.add("show");
    document.getElementById("installNote").textContent = "Installing the server jar on your node…";
    document.getElementById("installBar").style.width = "60%";
  } else {
    document.getElementById("installBanner").classList.remove("show");
  }
}

function paintStatus(status) {
  const pill = document.getElementById("srvPill");
  pill.className = "pill " + pillClass(status);
  document.getElementById("srvPillText").textContent = status.replace("_", " ");
  document.getElementById("stStatus").textContent = status.replace("_", " ");
  const running = status === "online" || status === "starting";
  document.querySelector('[data-power="start"]').disabled = running || status === "installing";
}

function wireTabs() {
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      document.getElementById("tab-" + b.dataset.tab).classList.add("active");
      if (b.dataset.tab === "files") loadFiles(curPath);
    };
  });
}

function wirePower() {
  document.querySelectorAll("[data-power]").forEach((b) => {
    b.onclick = async () => {
      const action = b.dataset.power;
      if (["stop", "kill", "restart"].includes(action) && !confirm(`${action[0].toUpperCase() + action.slice(1)} the server?`)) return;
      b.disabled = true;
      const r = await nodeApi(`/api/servers/${SERVER_ID}/power`, { method: "POST", body: { action } });
      if (!r.ok) toast(r.data.error || "Failed", "err");
      else { toast(`Server ${action}…`, "ok"); refreshServer(); }
      b.disabled = false;
    };
  });
}

// ---- console (polling) ----
const term = () => document.getElementById("terminal");
function addLine(entry) {
  const div = document.createElement("div");
  if (String(entry.line).startsWith("[MSOP]")) div.className = "sys";
  div.textContent = entry.line;
  const t = term();
  const stick = t.scrollHeight - t.scrollTop - t.clientHeight < 60;
  t.appendChild(div);
  while (t.children.length > 1000) t.firstChild.remove();
  if (stick) t.scrollTop = t.scrollHeight;
  if (entry.t > lastConsoleT) lastConsoleT = entry.t;
}
async function pollConsole() {
  const r = await nodeApi(`/api/servers/${SERVER_ID}/console?since=${lastConsoleT}`).catch(() => null);
  if (r && r.ok && r.data.lines) r.data.lines.forEach(addLine);
}
async function pollStats() {
  const r = await nodeApi(`/api/servers/${SERVER_ID}/stats`).catch(() => null);
  if (!r || !r.ok) return;
  const s = r.data;
  paintStatus(s.status);
  document.getElementById("stCpu").textContent = s.cpu;
  document.getElementById("barCpu").style.width = Math.min(100, s.cpu) + "%";
  document.getElementById("stMem").textContent = s.memory_mb;
  document.getElementById("barMem").style.width = SERVER ? Math.min(100, (s.memory_mb / SERVER.memory_mb) * 100) + "%" : "0%";
  document.getElementById("stPlayers").textContent = s.players;
  document.getElementById("stMaxPlayers").textContent = " / " + (s.max_players || 20);
  document.getElementById("stUptime").textContent = fmtUptime(s.uptime_s);
}
function wireConsole() {
  const input = document.getElementById("cmdInput");
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const cmd = input.value; input.value = "";
    if (!cmd.trim()) return;
    addLine({ t: Date.now(), line: "> " + cmd });
    await nodeApi(`/api/servers/${SERVER_ID}/command`, { method: "POST", body: { command: cmd } });
    setTimeout(pollConsole, 600);
  });
}

// ---- files ----
function joinPath(a, b) { return (a === "/" ? "" : a) + "/" + b; }
async function loadFiles(p) {
  curPath = p;
  const r = await nodeApi(`/api/servers/${SERVER_ID}/files?path=${encodeURIComponent(p)}`).catch(() => ({ ok: false }));
  if (!r.ok) { toast(r.data?.error || "Could not list files", "err"); return; }
  const parts = p.split("/").filter(Boolean);
  let crumbs = `<button data-p="/">root</button>`;
  let acc = "";
  for (const part of parts) { acc += "/" + part; crumbs += ` / <button data-p="${esc(acc)}">${esc(part)}</button>`; }
  document.getElementById("crumbs").innerHTML = crumbs;
  document.querySelectorAll("#crumbs button").forEach((b) => (b.onclick = () => loadFiles(b.dataset.p)));
  const rows = document.getElementById("fileRows");
  rows.innerHTML = r.data.entries.map((e) => {
    const full = joinPath(p, e.name);
    return `<tr>
      <td><span class="fname" data-open="${esc(full)}" data-type="${e.type}"><span class="ico">${e.type === "dir" ? "📁" : "📄"}</span>${esc(e.name)}</span></td>
      <td class="fsize">${e.type === "dir" ? "—" : fmtBytes(e.size)}</td>
      <td class="fmod">${fmtDate(e.modified)}</td>
      <td><div class="frow-actions">
        ${e.type === "file" ? `<button class="iconbtn" data-dl="${esc(full)}" data-name="${esc(e.name)}">Download</button>` : ""}
        ${e.type === "file" && e.editable ? `<button class="iconbtn" data-edit="${esc(full)}">Edit</button>` : ""}
        <button class="iconbtn" data-ren="${esc(full)}">Rename</button>
        <button class="iconbtn" data-del="${esc(full)}">Delete</button>
      </div></td></tr>`;
  }).join("") || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:26px">Empty folder</td></tr>`;
  rows.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = () => (el.dataset.type === "dir" ? loadFiles(el.dataset.open) : openEditor(el.dataset.open));
  });
  rows.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
    try { await nodeDownload(`/api/servers/${SERVER_ID}/files/download?path=${encodeURIComponent(b.dataset.dl)}`, b.dataset.name); }
    catch { toast("Download failed", "err"); }
  }));
  rows.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openEditor(b.dataset.edit)));
  rows.querySelectorAll("[data-ren]").forEach((b) => (b.onclick = async () => {
    const name = prompt("New name:", b.dataset.ren.split("/").pop());
    if (!name) return;
    const rr = await nodeApi(`/api/servers/${SERVER_ID}/files/rename`, { method: "POST", body: { path: b.dataset.ren, name } });
    rr.ok ? loadFiles(curPath) : toast(rr.data.error || "Rename failed", "err");
  }));
  rows.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`Delete ${b.dataset.del}?`)) return;
    const rr = await nodeApi(`/api/servers/${SERVER_ID}/files/delete`, { method: "POST", body: { path: b.dataset.del } });
    rr.ok ? (toast("Deleted", "ok"), loadFiles(curPath)) : toast(rr.data.error || "Delete failed", "err");
  }));
}
let editingPath = null;
async function openEditor(p) {
  const r = await nodeApi(`/api/servers/${SERVER_ID}/files/view?path=${encodeURIComponent(p)}`);
  if (!r.ok) { toast(r.data.error || "Cannot open file", "err"); return; }
  editingPath = p;
  document.getElementById("editorTitle").textContent = "Edit " + p.split("/").pop();
  document.getElementById("editorPath").textContent = p;
  document.getElementById("editorArea").value = r.data.content;
  openModal("editorModal");
}
function wireFiles() {
  document.getElementById("btnRefresh").onclick = () => loadFiles(curPath);
  document.getElementById("btnMkdir").onclick = async () => {
    const name = prompt("Folder name:");
    if (!name) return;
    const r = await nodeApi(`/api/servers/${SERVER_ID}/files/mkdir`, { method: "POST", body: { path: curPath, name } });
    r.ok ? loadFiles(curPath) : toast(r.data.error || "Failed", "err");
  };
  document.getElementById("btnUpload").onclick = () => document.getElementById("fileInput").click();
  document.getElementById("fileInput").onchange = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    toast("Uploading…");
    const r = await nodeApi(`/api/servers/${SERVER_ID}/files/upload?path=${encodeURIComponent(curPath)}`, { method: "POST", body: fd });
    r.ok ? (toast("Upload complete", "ok"), loadFiles(curPath)) : toast(r.data.error || "Upload failed", "err");
    e.target.value = "";
  };
  document.getElementById("editorSave").onclick = async () => {
    const r = await nodeApi(`/api/servers/${SERVER_ID}/files/save`, { method: "POST", body: { path: editingPath, content: document.getElementById("editorArea").value } });
    r.ok ? (toast("Saved", "ok"), closeModal("editorModal"), loadFiles(curPath)) : toast(r.data.error || "Save failed", "err");
  };
}

// ---- settings ----
function wireSettings() {
  document.getElementById("saveSettings").onclick = async () => {
    const r = await nodeApi(`/api/servers/${SERVER_ID}`, {
      method: "PUT",
      body: {
        name: document.getElementById("sName").value.trim(),
        memoryMB: parseInt(document.getElementById("sMem").value, 10),
        autostart: document.getElementById("sAutostart").checked,
      },
    });
    r.ok ? (toast("Settings saved", "ok"), refreshServer()) : toast(r.data.error || "Save failed", "err");
  };
  document.getElementById("deleteServer").onclick = async () => {
    const name = prompt(`Type the server name ("${SERVER.name}") to confirm deletion:`);
    if (name !== SERVER.name) { toast("Name did not match — cancelled", "err"); return; }
    const r = await nodeApi(`/api/servers/${SERVER_ID}?deleteFiles=1`, { method: "DELETE" });
    if (r.ok) { toast("Server deleted", "ok"); setTimeout(() => (location.href = "/panel/"), 800); }
    else toast(r.data.error || "Delete failed", "err");
  };
}
