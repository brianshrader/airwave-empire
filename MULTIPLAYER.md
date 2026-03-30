# Wavelength — Multiplayer Setup

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
node server.js
# or: npm start
```
Server runs at `http://localhost:3000`

### 3. Share your IP (LAN play)
Find your local IP address:
- **Mac/Linux:** `ifconfig | grep "inet " | grep -v 127.0.0.1`
- **Windows:** `ipconfig | findstr "IPv4"`

Share `http://YOUR_IP:3000` with other players on your network.

---

## How to Play Multiplayer

### Host (Player 1)
1. Open `http://localhost:3000` in your browser
2. On the scenario screen, click **🎙 MULTIPLAYER**
3. Click **CONNECT** (server address is pre-filled)
4. Enter your name → **CREATE GAME**
5. Choose your scenario
6. Share the **6-character room code** with other players
7. Once all players are in, click **START GAME**

### Guests (Players 2–4)
1. Open the server URL in your browser
2. On the scenario screen, click **🎙 MULTIPLAYER**
3. Click **CONNECT** with the server URL the host shared
4. Switch to the **JOIN GAME** tab
5. Enter your name and the room code → **JOIN ROOM**
6. Wait for the host to start

---

## How Turns Work

Each round:
1. **All players take their management actions** simultaneously (hire, fire, reformat, etc.)
2. All players see each other's actions broadcast in real-time
3. When done, non-host players click **✓ COMMIT PERIOD** (where NEXT PERIOD normally is)
4. The NEXT PERIOD button shows a commit counter: `⏳ WAITING 1/3`
5. **Once all players commit**, the host's NEXT PERIOD button activates
6. **Host clicks NEXT PERIOD** → simulation runs → new state broadcasts to all clients

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SERVER (server.js)                   │
│  • Room management (create/join/leave)                  │
│  • Action relay (broadcasts to all players in room)     │
│  • Commit gating (tracks who's committed each period)   │
│  • Signals host when all players committed              │
│  • Receives and rebroadcasts G after host runs advTurn  │
└────────────────┬──────────────────────────────┬─────────┘
                 │ Socket.io                     │
     ┌───────────▼──────────┐       ┌────────────▼──────────┐
     │    HOST CLIENT       │       │    GUEST CLIENT(S)    │
     │  • Runs advTurn()    │       │  • Applies remote     │
     │  • Broadcasts G      │       │    actions to local G │
     │  • Controls period   │       │  • Commits period     │
     │    advancement       │       │  • Receives state     │
     └──────────────────────┘       └───────────────────────┘
```

**Key design decisions:**
- **Host-authoritative:** The host's client runs `advTurn()` and is the source of truth. This avoids running the full game engine on the server.
- **Optimistic rendering:** Player actions are applied immediately to all clients' local G state for responsive UI. The authoritative state is synced at period end.
- **Action types broadcast:** fmt, hire, fire, sell, poach, sim, breaksim, stream, drift, rename, ident, spots

---

## Lobby Chat

A **RADIO ROOM** chat panel appears in the bottom-right during multiplayer games. Click the header to expand. Send messages with Enter.

---

## Host Migration

If the host disconnects, the server automatically promotes the next connected player to host. They'll see a news item: *"You are now the host — you control period advancement."*

---

## Accounts (Clerk) and billing (Stripe)

**Optional in development:** If `CLERK_SECRET_KEY` is not set in `.env`, multiplayer behaves as before (no login).

**Production:** Set `CLERK_SECRET_KEY` on the game server and put your **Publishable key** in `index.html`:

```html
<meta name="wl-clerk-publishable-key" content="pk_live_...">
```

Players use **Sign in** in the multiplayer lobby, then **CONNECT**. The client sends a Clerk session JWT on the Socket.io handshake; the server verifies it and attaches a stable **Clerk user id** to each player slot (`accountId` in room saves). Rejoining a slot that was claimed by another account is rejected.

**Solo games** still save only in the browser (`localStorage`) unless you add cloud saves later.

**Stripe:** With `STRIPE_SECRET_KEY` (and related vars in `.env.example`), `POST /api/billing/create-checkout-session` creates a Checkout session after verifying the same Bearer JWT. Clerk user ids are mapped to Stripe Customer ids in `data/stripe_customers.json` (replace with a real database when you scale). Configure `POST /api/stripe/webhook` in the Stripe Dashboard using `STRIPE_WEBHOOK_SECRET`.

**Spectator TV** (`spectate.html`) uses `auth: { spectate: true }` so the read-only board still works when Clerk is required for normal connections.

---

## Troubleshooting

**"Could not reach server"**  
→ Make sure `node server.js` is running.

**"Room not found"**  
→ Check the room code. Codes are case-insensitive but must be exactly 6 characters.

**"Game already in progress"**  
→ The host has already started. You can't join mid-game.

**Stuck on "WAITING N/N"**  
→ A player may have disconnected without committing. Disconnected players are auto-committed so this should self-resolve. If not, the host can refresh and the game will resume from autosave.

**Actions not showing up for other players**  
→ This is expected for some complex actions (acquisitions, loans) that involve server-side validation logic in future versions. Core actions (format changes, hires, fires) broadcast correctly.
