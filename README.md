# MSOP Hosting

Ultra-minimal Minecraft hosting site + hosted panel. Live at
**https://msophost.vercel.app**

- `/` — minimal landing page
- `/login.html` — Firebase login (Google + email/password)
- `/panel/` — the hosted panel: same UI as MSOP Panel, nodes synced per
  account via Firestore, all node calls proxied through `/api/node`

## Firebase setup (all free)

1. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
2. **Authentication → Settings → Authorized domains**: add `msophost.vercel.app`.
3. **Firestore Database**: paste `firestore.rules` → Publish.

That's it. No Cloud Functions / Hosting / Storage needed.

## How the hosted panel works

The panel UI is hosted here, but Minecraft servers run on **nodes** —
a VPS running the [MSOP Panel](https://github.com/MeowSamOPDZN/msop-panel)
backend (v1.1+, which adds API-token auth for remote access).

1. On a VPS: `curl -fsSL https://raw.githubusercontent.com/MeowSamOPDZN/msop-panel/main/install.sh | sudo bash`
2. Copy the **API token** printed at the end
   (or run `node server/setup.js --show-token` on the VPS later).
3. In the panel: **Connect node** → paste URL + token.
4. Nodes are stored in Firestore under your account, so your servers follow
   you across devices.

All browser → node traffic goes through `/api/node` (same-origin proxy),
so there's no mixed-content problem with `http://` VPS nodes.

## Deploy

Push to `main` — Vercel auto-deploys. Project: **MSOP Hosting**
(`msophost.vercel.app`).

## Layout

```
index.html / login.html      landing + login
panel/                       hosted panel (index, server)
css/landing.css              minimal landing styles
css/panel.css                panel UI (ported from MSOP Panel)
js/firebase-init.js          Firebase web config (public by design)
js/panel-common.js           auth guard, node API client, Firestore nodes
js/panel.js / panel-server.js  dashboard + server page
api/node.js                  serverless proxy to the user's node
firestore.rules              per-user read/write rules
```
