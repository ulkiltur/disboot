// server.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { ping, say } from './commands.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register commands in a collection
client.commands = new Collection();
const commands = [ping, say];
commands.forEach(cmd => client.commands.set(cmd.data.name, cmd));

// Register slash commands with Discord
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(c => c.data) }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
  }
});

// Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Login
client.login(process.env.TOKEN);
