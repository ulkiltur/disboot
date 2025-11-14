import db from '../database/db.js';

export const whoami = {
  data: {
    name: 'yo',
    description: 'Comprueba tus datos',
  },
  async execute(interaction) {
    const discordId = interaction.user.id;
    const row = db.prepare('SELECT ingame_name FROM users WHERE discord_id = ?').get(discordId);

    if (!row) {
      await interaction.reply("❌ You haven't registered an in-game name yet. Use /register <name>.", ephemeral: true);
    } else {
      await interaction.reply(`✅ Your registered in-game name is **${row.ingame_name}**.`, ephemeral: true);
    }
  },
};
