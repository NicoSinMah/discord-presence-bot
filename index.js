require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_USER_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RAWG_API_KEY,
} = process.env;

for (const [name, value] of Object.entries({
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_USER_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}. Check your .env file.`);
    process.exit(1);
  }
}

if (!RAWG_API_KEY) {
  console.warn(
    'RAWG_API_KEY not set — game artwork lookup is disabled. Games without ' +
      'Discord-provided art will fall back to your Discord avatar instead.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

// Activities we never want to surface as "what I'm doing" on the site,
// because they're already covered by the YouTube Music card (or are some
// other music/streaming service reporting itself to Discord).
const IGNORED_ACTIVITY_TYPES = new Set([
  2, // "Listening to ..." (Spotify, Apple Music, etc.)
  4, // Custom status
]);
const IGNORED_ACTIVITY_NAME_PATTERNS = [
  /youtube\s*music/i,
  /\bspotify\b/i,
  /apple\s*music/i,
  /soundcloud/i,
  /\byoutube\b/i,
];

function isIgnoredActivity(activity) {
  if (!activity) return true;
  if (IGNORED_ACTIVITY_TYPES.has(activity.type)) return true;
  const name = activity.name || '';
  return IGNORED_ACTIVITY_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function pickPrimaryActivity(activities) {
  // Only ever surface a real game/app activity (Playing, Streaming,
  // Watching, Competing). Music and custom-status activities are
  // filtered out entirely instead of being used as a fallback.
  return activities.find((a) => !isIgnoredActivity(a)) || null;
}

// ---------------------------------------------------------------
// RAWG.io lookup — many locally-detected games (Stardew Valley,
// R.E.P.O., etc.) don't implement Discord's Rich Presence SDK, so
// Discord never sends a `large_image` asset for them. When that
// happens we search RAWG by the activity name and use its cover
// art instead. Results (including "not found") are cached in
// memory for the life of the process so we don't re-query RAWG on
// every presence tick for the same game.
// ---------------------------------------------------------------
const gameArtworkCache = new Map(); // activity name -> url string | null

async function fetchGameArtwork(name) {
  if (!name || !RAWG_API_KEY) return null;
  if (gameArtworkCache.has(name)) return gameArtworkCache.get(name);

  try {
    const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      name
    )}&page_size=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RAWG responded with ${res.status}`);
    const data = await res.json();
    const image = data?.results?.[0]?.background_image || null;
    gameArtworkCache.set(name, image);
    return image;
  } catch (err) {
    console.warn(`[rawg] Failed to fetch artwork for "${name}": ${err.message}`);
    gameArtworkCache.set(name, null);
    return null;
  }
}

async function pushPresence(presence, member) {
  const status = presence?.status || 'offline';
  const activity = presence ? pickPrimaryActivity(presence.activities || []) : null;

  // The user's Discord avatar — used as the card photo whenever there's
  // no game/app open to show artwork for instead.
  const avatarUrl =
    member?.displayAvatarURL?.({ extension: 'png', size: 128 }) ||
    presence?.member?.displayAvatarURL?.({ extension: 'png', size: 128 }) ||
    null;

  // Prefer Discord's own Rich Presence artwork when the game provides
  // it; otherwise try to look up cover art on RAWG.
  let activityImageUrl = activity?.assets?.largeImageURL?.() || null;
  if (activity && !activityImageUrl) {
    activityImageUrl = await fetchGameArtwork(activity.name);
  }

  const row = {
    id: 1,
    status,
    activity_name: activity?.name || null,
    activity_details: activity?.details || activity?.state || null,
    // Artwork for whatever game/app is currently open.
    large_image_url: activityImageUrl,
    // Discord profile picture, used as the fallback photo when no
    // game/app activity is open (or no artwork could be found at all).
    avatar_url: avatarUrl,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('discord_presence').upsert(row);
  if (error) {
    console.error('Failed to push presence to Supabase:', error.message);
  } else {
    console.log(`Pushed presence: ${status}${activity ? ` (${activity.name})` : ''}`);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  const member = await guild.members.fetch(DISCORD_USER_ID);

  // Push the current state immediately on startup.
  await pushPresence(member.presence, member);
});

client.on('presenceUpdate', async (_oldPresence, newPresence) => {
  if (!newPresence || newPresence.userId !== DISCORD_USER_ID) return;
  await pushPresence(newPresence, newPresence.member);
});

client.login(DISCORD_BOT_TOKEN);
