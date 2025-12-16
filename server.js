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
import createEvent from './commands/createEvent.js';
import set_reminder from './commands/buggerme.js';
import cancel_reminders from './commands/unbuggerme.js';

const REMINDER_MINUTES_BEFORE = 15;
const MY_USER_ID = "1416909595955302431";
const leader_ID = "320573579961958402";

const db = await open({
      filename: "/var/data/users.sqlite",
      driver: sqlite3.Database,
  });

const now = new Date();
now.setMinutes(now.getMinutes() + 3);

const runAtMinutes = now.getMinutes();
const runAtHour = now.getHours();

const cronTime = `${runAtMinutes} ${runAtHour} * * *`;

console.log(`✅ Test reminder scheduled at ${now.toLocaleTimeString()}`);

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const roleId = "Goose";

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
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.commands = new Collection();
const commandList = [register, whoami, ocr, rank, hammertime, set_reminder, cancel_reminders, createEvent];

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
    await db.run(
      `INSERT INTO dm_consent (user_id, consent, agreed_at)
       VALUES (?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET consent=1, agreed_at=?`,
      userId,
      Date.now(),
      Date.now()
    );

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

  const guild = await client.guilds.fetch("1445401393643917366");

  // Fetch all members
  await guild.members.fetch();

  // Filter members safely by role
  const membersWithRole = [];
  for (const member of guild.members.cache.values()) {
    try {
      const fullMember = await guild.members.fetch(member.id); // ensure full data
      if (fullMember.roles.cache.has(roleId) && !fullMember.user.bot) {
        membersWithRole.push(fullMember);
      }
    } catch (err) {
      console.error(`Failed to fetch member ${member.id}:`, err.message);
    }
  }

  console.log(`Found ${membersWithRole.length} members with role`);

  // Insert into DB
  for (const member of membersWithRole) {
    await db.run(
      `INSERT INTO dm_consent (user_id, consent, agreed_at)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET consent=1, agreed_at=?`,
      member.id,
      Date.now(),
      Date.now()
    );
  }

  console.log("✅ Members added to dm_consent");
});


/*
cron.schedule(cronTime, async () => { // runs every minute
  try {
    const user = await client.users.fetch(MY_USER_ID);
    const user2 = await client.users.fetch(leader_ID);


    const currentDay = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());

    const events = await db.all("SELECT * FROM events");
    const eventsToday = events.filter(ev =>
      ev.day.split(",").map(d => d.trim()).includes(currentDay)
    );

    if (eventsToday.length > 0) {
      let message = `⏰ **Today's Events:**\n`;

      for (const ev of eventsToday) {
        message += `- ${ev.event_name} at <t:${ev.time_unix}:t>\n`;
      }

      message += `\nTurn off reminders with /cancel_reminders`;

      await user.send(message);
      await user2.send(message);
    }
  } catch (err) {
    console.error("❌ Failed to send event reminders:", err);
  }
});
*/


cron.schedule("* * * * *", async () => {
  const now = new Date();
  const currentDay = now.toLocaleDateString("en-US", { weekday: "long" }); // Monday, Tuesday...
  const currentUnix = Math.floor(now.getTime() / 1000);

  try {
    // Fetch all events
    const events = await db.all(`SELECT * FROM events`);

    // Filter events scheduled for today
    const eventsToday = events
      .filter(ev => {
        const eventDays = ev.day.split(",").map(d => d.trim());
        return eventDays.includes(currentDay);
      })
      .sort((a, b) => a.time_unix - b.time_unix); // sort by time

    if (eventsToday.length === 0) return;

    const firstEvent = eventsToday[0];
    const oneHourBefore = firstEvent.time_unix - 60 * 60; // 1h before

    if (currentUnix >= oneHourBefore && currentUnix < oneHourBefore + 60) {
      const roleId = "ROLE_ID_HERE";

      await guild.members.fetch(); // populates guild.members.cache

      for (const guild of client.guilds.cache.values()) {
        const membersWithRole = guild.members.cache.filter(member =>
          member.roles.cache.has(roleId)
        );

        for (const member of membersWithRole.values()) {
          // Only add if they haven't opted out
          const consentRow = await db.get(
            "SELECT consent FROM dm_consent WHERE user_id = ?",
            member.id
          );

          if (consentRow.consent !== 0) {
            await db.run(
              `INSERT INTO dm_consent (user_id, consent, agreed_at)
               VALUES (?, 1, ?)
               ON CONFLICT(user_id) DO UPDATE SET consent=1, agreed_at=?`,
              member.id,
              Date.now(),
              Date.now()
            );
          }
        }
      }
    }

    for (const event of eventsToday) {
      const eventTime = event.time_unix;
      const reminderTime = eventTime - REMINDER_MINUTES_BEFORE * 60;

      if (currentUnix >= reminderTime && currentUnix < reminderTime + 60) {
        try {
          for (const guild of client.guilds.cache.values()) {
            for (const member of guild.members.cache.values()) {
              if (member.user.bot) continue;

              const consentRow = await db.get(
                "SELECT consent FROM dm_consent WHERE user_id = ?",
                member.id
              );
              if (consentRow.consent !== 1) continue;

              if (eventsToday.length > 0) {
                let message = `⏰ **Today's Events:**\n`;

                for (const ev of eventsToday) {
                  message += `- ${ev.event_name} at <t:${ev.time_unix}:t>\n`;
                }

                message += `\nTurn off reminders with /cancel_reminders`;

                await user.send(message);
              }
            }
          }

          // Mark event reminder as sent
          await db.run(
            "UPDATE events SET reminder_sent = 1 WHERE id = ?",
            event.id
          );
        } catch (err) {
          console.error("Failed to send reminder:", err);
        }
      }
    }

  } catch (err) {
    console.error("Failed to fetch events:", err);
  }
});

client.login(process.env.TOKEN);
