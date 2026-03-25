# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Wavelength is a multiplayer radio station management simulation game (Atlanta, 1970–2020). It is a single Node.js application — Express serves static files and Socket.io handles real-time multiplayer. No database, no build step, no external services.

### Running the application

```bash
npm start          # or: node server.js
npm run dev        # uses --watch for auto-restart on file changes
```

Server listens on port 3000 by default (`PORT` env var overrides). Open `http://localhost:3000` in a browser to play.

### Key files

- `server.js` — Express + Socket.io server (rooms, persistence, action relay)
- `index.html` — Modular game entry point (loads `src/legacy.js` and `src/styles.css`)
- `wavelength-ui.html` — Legacy monolithic version (fallback if `index.html` is missing)
- `src/legacy.js` — Game engine logic (~10K lines)
- `src/styles.css` — Extracted styles
- `saves/` — JSON save files for multiplayer rooms (created at runtime)

### Notes

- No linter or test framework is configured in the project.
- No build step — the frontend is vanilla HTML/CSS/JS served directly by Express.
- Persistence is file-based (`./saves/*.json`); no database required.
- The `npm run dev` script uses Node's built-in `--watch` flag for hot reload on server changes. Frontend changes (HTML/CSS/JS) are picked up on browser refresh since they are served statically.
- Multiplayer setup details are in `MULTIPLAYER.md`.
