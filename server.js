import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import register from "./commands/register.js";
import whoami from "./commands/whoami.js";
import ocr from "./commands/ocr.js";
import rank from "./commands/rank.js";
import hammertime from "./commands/time.js";
import dns from "node:dns";
import { fullData } from './commands/ocr.js';


dns.setDefaultResultOrder("ipv4first");




// -------------------------------
// Fake port server for Render
// -------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.post('/ocr/callback', async (req, res) => {
  const { job_id, discordId, text: ocrText } = req.body;

  // Write OCR text to shared variable
  fullData.text = ocrText;
  fullData.discordId = discordId;
  
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



client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
