<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Airwave Empire. The `posthog-node` SDK was installed and a shared client module was created at `server/posthog.js`. Event tracking was added across 6 server-side files covering all major business-critical actions: multiplayer game sessions, AI-powered feature generation, cloud saves, Stripe billing, and user feedback. Error tracking via `captureException` was added to AI route catch blocks and a global Express error middleware. Graceful shutdown (`posthog.shutdown()`) is called on `SIGTERM`/`SIGINT`. Environment variables `POSTHOG_API_KEY` and `POSTHOG_HOST` are stored in `.env`.

| Event | Description | File |
|-------|-------------|------|
| `room created` | A multiplayer room is created by a host player | `server.js` |
| `room joined` | A new player joins a lobby room | `server.js` |
| `room rejoined` | A player reconnects to an in-progress game | `server.js` |
| `game started` | A multiplayer game session starts | `server.js` |
| `draft started` | Station draft phase begins for a multiplayer game | `server.js` |
| `draft pick made` | A player picks a station during the draft phase | `server.js` |
| `draft completed` | Draft phase ends and the game begins | `server.js` |
| `game period advanced` | Host advances the game by one period after all players commit | `server.js` |
| `checkout session created` | A Stripe checkout session is created | `server/stripeBilling.js` |
| `subscription activated` | A Stripe subscription becomes active or trialing | `server/stripeBilling.js` |
| `cloud save created` | User creates a new cloud save slot | `server/cloudSaves.js` |
| `cloud save updated` | User overwrites an existing cloud save slot | `server/cloudSaves.js` |
| `cloud save deleted` | User deletes a cloud save | `server/cloudSaves.js` |
| `feedback submitted` | User submits in-game beta feedback | `server/feedbackRoutes.js` |
| `station logo generated` | AI-generated station logo is successfully created | `server/logoRoutes.js` |
| `station jingle generated` | AI-generated station jingle is successfully created | `server/jingleRoutes.js` |
| `ratings digest generated` | AI ratings digest article is generated for a market book | `server/ratingsDigestRoutes.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/382128/dashboard/1466407
- **Game session funnel** (room created → room joined → game started): https://us.posthog.com/project/382128/insights/uuXYvRfx
- **AI features usage trend** (logo, jingle, ratings digest): https://us.posthog.com/project/382128/insights/dKCqM0Yb
- **Billing conversion funnel** (checkout started → subscription activated): https://us.posthog.com/project/382128/insights/9PShRP8l
- **Cloud save activity** (creates, updates, deletes): https://us.posthog.com/project/382128/insights/CWNGyzBS
- **Multiplayer engagement over time** (games started, periods advanced): https://us.posthog.com/project/382128/insights/MG7yWjbM

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
