# Discord Presence → Supabase

A Node.js bot that listens to your Discord presence in real time and syncs it to a Supabase table. Use it to show what you're up to on your website (portfolio, personal page, etc.): your status, the game you're playing, and its cover art.

## Features

- Connects to your Discord server and tracks **your** presence (single user).
- Upserts a single row (`id = 1`) into the `discord_presence` table in Supabase whenever your status or activity changes.
- Pushes your status (`online`, `idle`, `dnd`, `offline`), the current activity name and details, and an image.
- **Filters out music and custom status activities** (Spotify, YouTube Music, Apple Music, SoundCloud, YouTube, custom status), assuming those are displayed in a separate card.
- **Looks up game cover art on [RAWG.io](https://rawg.io/apidocs)** when Discord doesn't provide any (e.g. locally detected games that don't use Rich Presence). Results are cached in memory.
- Falls back to your **Discord avatar** when no game is open.

## Requirements

- Node.js **18+** (uses native `fetch`)
- A Discord application/bot
- A Supabase project
- (Optional) A RAWG API key

## Installation

```bash
git clone <your-repo-url>
cd <your-project-folder>
npm install discord.js @supabase/supabase-js dotenv
```

## Setup

### 1. Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **Bot**, copy the bot token.
3. Enable these **Privileged Gateway Intents**:
   - **Presence Intent**
   - **Server Members Intent**
4. Invite the bot to your server (OAuth2 → URL Generator → `bot` scope).
5. Make sure you are in the same server. The bot can only see presences of members who share a server with it.

> To get your server and user IDs, enable **Developer Mode** in Discord (Settings → Advanced), then right-click and choose *Copy ID*.

### 2. Supabase table

Run this SQL in the Supabase SQL editor:

```sql
create table discord_presence (
  id integer primary key,
  status text,
  activity_name text,
  activity_details text,
  large_image_url text,
  avatar_url text,
  updated_at timestamptz
);
```

If you plan to read the table from your frontend using the `anon` key, enable RLS and add a read-only policy:

```sql
alter table discord_presence enable row level security;

create policy "Public read access"
  on discord_presence for select
  using (true);
```

(The bot writes with the `service_role` key, which bypasses RLS.)

### 3. Environment variables

Create a `.env` file in the project root:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_server_id
DISCORD_USER_ID=your_user_id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RAWG_API_KEY=your_rawg_api_key   # optional
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_GUILD_ID` | Yes | ID of the server the bot is in |
| `DISCORD_USER_ID` | Yes | ID of the user whose presence is tracked |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase `service_role` key |
| `RAWG_API_KEY` | No | If missing, cover art lookup is disabled and your avatar is used instead |

> ⚠️ **Never commit your `.env` file** or expose the `service_role` key in the frontend. Add `.env` to your `.gitignore`.

## Usage

```bash
node index.js
```

(Adjust the filename if yours is different.) On startup the bot immediately pushes your current presence, then updates on every `presenceUpdate` event.

Expected output:

```
Logged in as MyBot#1234
Pushed presence: online (Stardew Valley)
```

To keep it running permanently, use [PM2](https://pm2.keymetrics.io/), Docker, or a hosting service like Railway or Render:

```bash
pm2 start index.js --name discord-presence
```

## Data format

Each update writes a row like this:

```json
{
  "id": 1,
  "status": "online",
  "activity_name": "Stardew Valley",
  "activity_details": "Year 2, Summer",
  "large_image_url": "https://media.rawg.io/...",
  "avatar_url": "https://cdn.discordapp.com/avatars/...",
  "updated_at": "2026-10-16T12:00:00.000Z"
}
```

If there is no valid activity, `activity_name`, `activity_details`, and `large_image_url` are set to `null`.

## Customization

- **Ignored activities:** edit `IGNORED_ACTIVITY_TYPES` and `IGNORED_ACTIVITY_NAME_PATTERNS` to filter other apps or services.
- **Different artwork source:** replace `fetchGameArtwork` with another API (IGDB, SteamGridDB, etc.).

## Troubleshooting

| Problem | Possible cause |
|---|---|
| Bot doesn't receive presences | *Presence Intent* or *Server Members Intent* not enabled in the Developer Portal |
| `Missing required env var` | A variable is missing from your `.env` file |
| `Failed to push presence to Supabase` | Table doesn't exist, column names differ, or wrong `service_role` key |
| No game cover art | `RAWG_API_KEY` is missing or RAWG couldn't find the game (avatar is used as fallback) |
| Status is always `offline` | You don't share a server with the bot, or `DISCORD_USER_ID` is wrong |

## Built with

- [discord.js](https://discord.js.org/)
- [Supabase](https://supabase.com/)
- [RAWG API](https://rawg.io/apidocs)
- [dotenv](https://github.com/motdotla/dotenv)

## IA

This README file and some features were created using AI.
