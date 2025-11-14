import db from '../database/db.js';

export const register = {
  data: {
    name: 'registro',
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
    const ingameName = interaction.options.getString('name').trim();

    // Check if the name is already taken by someone else (case-insensitive)
    const row = db
      .prepare('SELECT discord_id FROM users WHERE LOWER(ingame_name) = LOWER(?)')
      .get(ingameName);

    if (row && row.discord_id !== discordId) {
      await interaction.reply(`❌ The name **${ingameName}** is already registered by someone else.`, ephemeral: true);
      return;
    }

    // Insert or update user's own record
    const stmt = db.prepare(`
      INSERT INTO users (discord_id, ingame_name)
      VALUES (?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET ingame_name=excluded.ingame_name
    `);
    stmt.run(discordId, ingameName);

    // Update the user's nickname in the server
    try {
      const member = await interaction.guild.members.fetch(discordId);
      if (member) {
        await member.setNickname(ingameName);
      }
    } catch (err) {
      console.error('Failed to change nickname:', err);
    }

    await interaction.reply(`✅ Registered your in-game name as **${ingameName}**!`);
  },
};
