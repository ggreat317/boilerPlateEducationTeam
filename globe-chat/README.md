# Globe Chat

A news globe with live chat for each country. Spin the globe, click a country, and talk about that country's news with everyone else viewing it. The chat stays off until a country is selected.

This is a standalone prototype. It doesn't use the React frontend, the Express backend, or Supabase in this repo. It has its own small server.

## Run it

You need Node.js 18 or newer.

```bash
cd globe-chat
npm install
npm start            # then open http://localhost:3000
```

Open two browser tabs and click the same country in both to see messages arrive live.

If you get `EADDRINUSE`, something else is already using port 3000. Stop it, or run `PORT=3001 npm start`.

## How it works

| File | What it does |
|---|---|
| `server.js` | Serves the site and runs the chat. Each country is its own Socket.IO room, so messages only reach people viewing that country. It also checks and cleans messages and saves chats to `data/chat-history.json`. |
| `public/index.html` | Page layout: the globe view and the chat panel. |
| `public/app.js` | Browser code: draws the globe, the starfield, and the chat panel, and talks to the server. |
| `public/style.css` | All styling. The colors are named variables at the top. |
| `public/countries.geojson` | Country outlines, names, and 3 letter codes (used as chat room names). |
| `public/fonts/` | Chakra Petch and IBM Plex Sans, stored locally so they work offline (license files included). |
| `backups/classic-ui/` | The earlier, simpler look. It isn't used by the app. |

## Chat rules (set at the top of `server.js`)

- You can only send a message after selecting a country.
- Messages are limited to 500 characters and one per second per person.
- Invisible and text-flipping characters are removed, and anything over 10 KB is refused.
- The newest 50 messages per country are kept. Saved chats live in `data/`, which is in `.gitignore`.
