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
      await interaction.reply({
        content:"❌ Aún no te has registrado. Usa /registro <nombre>.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content:`✅ Tu nombre en el juego es **${row.ingame_name}**.`,
        ephemeral: true
      });
    }
  },
};
