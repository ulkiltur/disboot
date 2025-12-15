import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import register from "./commands/register.js";
import whoami from "./commands/whoami.js";
import ocr from "./commands/ocr.js";
import rank from "./commands/rank.js";
import hammertime from "./commands/time.js";
import dns from "node:dns";
export const ocrWaiters = new Map();



dns.setDefaultResultOrder("ipv4first");




// -------------------------------
// Fake port server for Render
// -------------------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.post('/ocr/callback', (req, res) => {
  const { text, discordId } = req.body;

  const waiter = ocrWaiters.get(discordId);
  if (waiter) {
    waiter.resolve(text);
    ocrWaiters.delete(discordId);
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
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

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

  /*const activateThreads = ["1445444475483721799", "1450101670418579527", "1447476754930204853", "1449797536905691298", "1446129574378475603",
    "1446639680413237407", "1448422081531347067", "1445787197503439050", "1446761409169063998", "1447239208128479303", "1445465627761574050",
    "1445473630279700543", "1445817026735247471"];
    for (const id of activateThreads) {
    try {
      const thread = await client.channels.fetch(id);

      if (!thread?.isThread()) continue;

      await thread.setAutoArchiveDuration(10080); // max allowed
      console.log(`⏳ Set keep-alive for ${id}`);
    } catch (e) {
      console.error(`Failed to archive ${id}`, e.message);
    }
  }

  const archiveThreads = ["1445763806948229171", "1447195005692416185", "1446456107110498365"];
    for (const id of archiveThreads) {
    try {
      const thread = await client.channels.fetch(id);

      if (!thread?.isThread()) continue;

      if (thread.locked) {
        await thread.setLocked(false);
      }

      if (!thread.archived) {
        await thread.setArchived(true);
        console.log(`📦 Archived thread ${id}`);
      }
    } catch (e) {
      console.error(`Failed to archive ${id}`, e.message);
    }
  }*/
});

client.login(process.env.TOKEN);
