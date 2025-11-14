import db from '../database/db.js';

export const register = {
  data: {
    name: 'register',
    description: 'Link your Discord account to your in-game name',
    options: [
      {
        name: 'name',
        type: 3, // STRING
        description: 'Your in-game name',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    const discordId = interaction.user.id;
    const ingameName = interaction.options.getString('name');

    // Insert or update
    const stmt = db.prepare(`
      INSERT INTO users (discord_id, ingame_name)
      VALUES (?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET ingame_name=excluded.ingame_name
    `);
    stmt.run(discordId, ingameName);

    await interaction.reply(`✅ Registered your in-game name as **${ingameName}**!`);
  },
};
