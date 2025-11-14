import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { SlashCommandBuilder } from "discord.js";

const sqlite = sqlite3.verbose();

export default {
  data: new SlashCommandBuilder()
    .setName("registro")
    .setDescription("Registrar o actualizar")
    .addStringOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre del personaje en WWM")
        .setRequired(true)
    ),

  async execute(interaction) {
    const ingameName = interaction.options.getString("name").trim();
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);

    const db = await open({
      filename: "./database/users.sqlite",
      driver: sqlite.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        ingame_name TEXT
      );
    `);

    const existingName = await db.get(
      "SELECT discord_id FROM users WHERE LOWER(ingame_name) = LOWER(?)",
      ingameName
    );

    if (existingName && existingName.discord_id !== interaction.user.id) {
      return interaction.reply({
        content: `❌ El nombre **${ingameName}** ya está registrado.`,
        ephemeral: true
      });
    }

    const userRow = await db.get(
      "SELECT * FROM users WHERE discord_id = ?",
      interaction.user.id
    );

    if (userRow) {
      await db.run(
        "UPDATE users SET ingame_name = ? WHERE discord_id = ?",
        ingameName,
        interaction.user.id
      );

      try { await member.setNickname(ingameName); } catch {}

      return interaction.reply({
        content: `🔄 Se ha actualizado tu nombre a **${ingameName}**!`,
        ephemeral: true
      });
    }

    await db.run(
      "INSERT INTO users (discord_id, ingame_name) VALUES (?, ?)",
      interaction.user.id,
      ingameName
    );

    try { await member.setNickname(ingameName); } catch {}

    return interaction.reply({
      content: `✅ Registrado exitosamente: **${ingameName}**!`,
      ephemeral: true
    });
  }
};
