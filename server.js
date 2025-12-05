import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import register from "./commands/register.js";
import whoami from "./commands/whoami.js";
import ocr from "./commands/ocr.js";
import rank from "./commands/rank.js";



// -------------------------------
// Fake port server for Render
// -------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Discord bot is running!'));
app.listen(PORT, () => console.log(`Render keep-alive server running on port ${PORT}`));

// -------------------------------
// Discord Bot Setup
// -------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandList = [register, whoami, ocr, rank];

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


const ALLOWED_USERS = [
  '1416909595955302431', // User 1 ID
  '320573579961958402', // User 2 ID
  '1439615858480775198'  // User 3 ID
];

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Check if user is allowed
  if (!ALLOWED_USERS.includes(interaction.user.id)) {
    return interaction.reply({
      content: '❌ You are not allowed to use this command.',
      ephemeral: true
    });
  }

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
      await interaction.reply({ content: '❌ Error executing command', ephemeral: true });
    }
  }
});


client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
