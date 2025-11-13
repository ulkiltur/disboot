import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { ping, say } from './commands.js'; // import your commands

// Create the Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Register commands
client.commands = new Collection();
const commands = { ping, say };
for (const [name, command] of Object.entries(commands)) {
  client.commands.set(name, command);
}

// Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Listen to messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.reply('There was an error executing that command!');
  }
});

// Login using GitHub Secret (environment variable)
const token = process.env.TOKEN; // GitHub Actions will inject this
if (!token) {
  console.error('Error: TOKEN not found in environment variables!');
  process.exit(1);
}
client.login(token);
