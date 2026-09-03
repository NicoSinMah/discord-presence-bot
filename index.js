require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_USER_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

function pickPrimaryActivity(activities) {
  // Ignore the "Custom Status" activity type when a real game/app
  // activity is also present; otherwise fall back to it.
  const nonCustom = activities.find((a) => a.type !== 4);
  return nonCustom || activities[0] || null;
}

async function pushPresence(presence) {
  const status = presence?.status || 'offline';
  const activity = presence ? pickPrimaryActivity(presence.activities || []) : null;

  const row = {
    id: 1,
    status,
    activity_name: activity?.name || null,
    activity_details: activity?.details || activity?.state || null,
    large_image_url: activity?.assets?.largeImageURL?.() || null,
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
  await pushPresence(member.presence);
});

client.on('presenceUpdate', async (_oldPresence, newPresence) => {
  if (!newPresence || newPresence.userId !== DISCORD_USER_ID) return;
  await pushPresence(newPresence);
});

client.login(DISCORD_BOT_TOKEN);
