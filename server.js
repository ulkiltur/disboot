import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import register from "./commands/register.js";
import whoami from "./commands/whoami.js";
import ocr from "./commands/ocr.js";
import rank from "./commands/rank.js";
import hammertime from "./commands/time.js";
import dns from "node:dns";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cron from "node-cron";

const REMINDER_MINUTES_BEFORE = 15;
const MY_USER_ID = "1416909595955302431";

const now = new Date();
now.setMinutes(now.getMinutes() + 10);

const runAtMinutes = now.getMinutes();
const runAtHour = now.getHours();

const cronTime = `${runAtMinutes} ${runAtHour} * * *`;

console.log(`✅ Test reminder scheduled at ${now.toLocaleTimeString()}`);

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const db = await open({
  filename: "./data/users.sqlite",  // adjust path
  driver: sqlite3.Database,
});

export const ocrWaiters = new Map();

export const userRateLimits = new Map();
/*
discordId => {
  timestamps: number[],
  running: number
}
*/

const MAX_JOBS_PER_WINDOW = 2;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT = 1;

export function checkRateLimit(discordId) {
  const now = Date.now();

  let entry = userRateLimits.get(discordId);
  if (!entry) {
    entry = { timestamps: [], running: 0 };
    userRateLimits.set(discordId, entry);
  }

  // drop expired timestamps
  entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS);

  if (entry.running >= MAX_CONCURRENT) {
    return { ok: false, reason: "You already have an OCR running." };
  }

  if (entry.timestamps.length >= MAX_JOBS_PER_WINDOW) {
    const wait = Math.ceil((WINDOW_MS - (now - entry.timestamps[0])) / 1000);
    return { ok: false, reason: `Rate limit reached. Try again in ${wait}s.` };
  }

  // reserve slot
  entry.timestamps.push(now);
  entry.running++;

  return { ok: true };
}

export function releaseRateLimit(discordId) {
  const entry = userRateLimits.get(discordId);
  if (!entry) return;

  entry.running = Math.max(0, entry.running - 1);

  if (entry.running === 0 && entry.timestamps.length === 0) {
    userRateLimits.delete(discordId);
  }
}



dns.setDefaultResultOrder("ipv4first");




// -------------------------------
// Fake port server for Render
// -------------------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.post('/ocr/callback', (req, res) => {
  const { text, jobId } = req.body;

  const waiter = ocrWaiters.get(jobId);
  if (waiter) {
    waiter.resolve(text);
    ocrWaiters.delete(jobId);
  }

  res.sendStatus(200);
});




app.get('/', (req, res) => res.send('Discord bot is running!'));
app.listen(PORT, () => console.log(`Render keep-alive server running on port ${PORT}`));

// -------------------------------
// Discord Bot Setup
// -------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandList = [register, whoami, ocr, rank, hammertime];

// Add commands to collection
commandList.forEach(cmd => client.commands.set(cmd.data.name, cmd));

// -------------------------------
// Register slash commands with Discord
// -------------------------------

const guilds = [process.env.GUILD_ID, "1445401393643917366"];


(async () => {
  try {
    console.log('Refreshing slash commands…');

    for (const guildId of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commandList.map(c => c.data.toJSON()) }
      );
      console.log(`Slash commands registered for guild ${guildId}`);
    }

  } catch (error) {
    console.error(error);
  }
})();


client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // -------------------------------
  // Handle interactions
  // -------------------------------
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Error executing command', flags: 64 });
    }
  }

  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (interaction.customId === "dm_accept") {
    await db.run(
      `INSERT INTO dm_consent (user_id, consent, agreed_at)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET consent=1, agreed_at=?`,
      userId,
      Date.now(),
      Date.now()
    );

    await interaction.update({
      content: "✅ You’re now subscribed to DM reminders!",
      components: []
    });
  }

  if (interaction.customId === "dm_decline") {
    await interaction.update({
      content: "❌ No problem — you won’t receive any DMs.",
      components: []
    });
  }


});

client.on("guildCreate", async (guild) => {
  console.log(`Joined new guild: ${guild.id}`);

  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
      { body: commandList.map(c => c.data.toJSON()) }
    );

    console.log(`Slash commands registered for new guild ${guild.id}`);
  } catch (err) {
    console.error("Failed to register commands for new guild:", err);
  }
});



client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const activateThreads = ["1445444475483721799", "1450101670418579527", "1447476754930204853", "1449797536905691298", "1446129574378475603",
    "1446639680413237407", "1448422081531347067", "1445787197503439050", "1446761409169063998", "1447239208128479303", "1445465627761574050",
    "1445473630279700543", "1445817026735247471"];
    for (const id of activateThreads) {
    try {
      const thread = await client.channels.fetch(id);

      if (!thread?.isThread()) continue;

      await thread.setAutoArchiveDuration(10080);
      console.log(`⏳ Set keep-alive for ${id}`);
    } catch (e) {
      console.error(`Failed to archive ${id}`, e.message);
    }
  }

  const archiveThreads = ["1445763806948229171", "1447195005692416185", "1446456107110498365"];
});

cron.schedule(cronTime, async () => {
  try {
    const user = await client.users.fetch(MY_USER_ID);
    await user.send("⏰ Test: This is your 10-minute reminder!");
    console.log("✅ Test reminder sent!");
  } catch (err) {
    console.error("❌ Failed to send test reminder:", err);
  }
});

cron.schedule("* * * * *", async () => {
  const now = new Date();
  const currentDay = now.toLocaleDateString("en-US", { weekday: "long" }); // Monday, Tuesday...
  const currentUnix = Math.floor(now.getTime() / 1000);

  const db = await open({ filename: "./events.sqlite", driver: sqlite3.Database });

  try {
    // Fetch events today
    const events = await db.all(
      `SELECT * FROM events WHERE day = ?`,
      currentDay
    );

    for (const event of events) {
      const eventTime = event.time_unix;
      const reminderTime = eventTime - REMINDER_MINUTES_BEFORE * 60;

      // Send DM if it's time for the reminder
      if (currentUnix >= reminderTime && currentUnix < reminderTime + 60) {
        try {
          for (const guild of client.guilds.cache.values()) {
            for (const member of guild.members.cache.values()) {
              if (member.user.bot) continue;

              // Check dm_consent table
              const consentRow = await db.get(
                "SELECT consent FROM dm_consent WHERE user_id = ?",
                member.id
              );
              if (!consentRow || consentRow.consent !== 1) continue;

              await member.send(
                `⏰ Reminder: Event **${event.event_name}** starts at <t:${eventTime}:F> today!`
              );
            }
          }
        } catch (err) {
          console.error("Failed to send reminder:", err);
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch events:", err);
  } finally {
    await db.close();
  }
});

client.login(process.env.TOKEN);
