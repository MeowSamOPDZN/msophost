// MSOP Hosting — shared panel helpers (ES module).
import { auth, db } from "/js/firebase-init.js";
import {
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export let USER = null;
export let NODE = null; // { id, name, url, token }

export function requireLogin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (u) => {
      if (!u) location.href = "/login.html";
      else { USER = u; resolve(u); }
    });
  });
}

export function paintUser() {
  const n = document.getElementById("chipName");
  const a = document.getElementById("chipAvatar");
  const name = USER.displayName || USER.email?.split("@")[0] || "player";
  if (n) n.textContent = name;
  if (a) a.textContent = name[0].toUpperCase();
  const lb = document.getElementById("logoutBtn");
  if (lb) lb.onclick = async () => { await signOut(auth); location.href = "/"; };
}

export function toast(msg, kind = "") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3400);
}

export function openModal(id) { document.getElementById(id).classList.add("open"); }
export function closeModal(id) { document.getElementById(id).classList.remove("open"); }
document.addEventListener("click", (e) => {
  if (e.target.hasAttribute("data-close")) closeModal(e.target.closest(".modal-back").id);
  if (e.target.classList && e.target.classList.contains("modal-back")) e.target.classList.remove("open");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll(".modal-back.open").forEach((m) => m.classList.remove("open"));
});

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}
export function fmtDate(ms) {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function fmtUptime(s) {
  if (!s || s < 5) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export function pillClass(status) {
  return { online: "online", offline: "offline", starting: "starting", stopping: "stopping", installing: "installing", install_failed: "install_failed" }[status] || "offline";
}

// ---- nodes (synced per account via Firestore) ----
export async function loadNodes() {
  const snap = await getDocs(collection(db, "users", USER.uid, "nodes"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function saveNode({ name, url, token }) {
  const ref = await addDoc(collection(db, "users", USER.uid, "nodes"), {
    name, url: url.replace(/\/$/, ""), token, createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function deleteNode(id) {
  await deleteDoc(doc(db, "users", USER.uid, "nodes", id));
}
export function setNode(n) { NODE = n; if (n) localStorage.setItem("msophost_node", n.id); }
export function clearNodeSel() { localStorage.removeItem("msophost_node"); }

// ---- proxied node API: browser -> Vercel (/api/node) -> your VPS ----
export async function nodeApi(target, opts = {}) {
  if (!NODE) throw new Error("No node selected");
  const headers = { "x-node-url": NODE.url, "x-node-token": NODE.token };
  let body;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) body = opts.body;
    else { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  }
  let res;
  try {
    res = await fetch("/api/node?target=" + encodeURIComponent(target), {
      method: opts.method || "GET", headers, body,
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: "Could not reach MSOP Hosting proxy" } };
  }
  const ct = res.headers.get("content-type") || "";
  let data;
  try { data = ct.includes("json") ? await res.json() : await res.text(); }
  catch { data = {}; }
  if (!res.ok && res.status === 502) data = { error: "Node unreachable — is your VPS online?" };
  return { ok: res.ok, status: res.status, data };
}

// file download via proxy -> blob -> save
export async function nodeDownload(target, filename) {
  const headers = { "x-node-url": NODE.url, "x-node-token": NODE.token };
  const res = await fetch("/api/node?target=" + encodeURIComponent(target), { headers });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
