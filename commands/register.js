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
        .setName("name")
        .setDescription("Tu nombre en el juego")
        .setRequired(true) // ✅ required, ensures getString never returns null
    ),

  async execute(interaction) {
    // Get the name safely
    const ingameName = interaction.options.getString("name");
    if (!ingameName) {
      return interaction.reply({
        content: "❌ Debes ingresar un nombre válido.",
        flags: 64, // EPHEMERAL
      });
    }

    const name = ingameName.trim();
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);

    const db = await open({
      filename: "./database/users.sqlite",
      driver: sqlite.Database,
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        ingame_name TEXT
      );
    `);

    const existingName = await db.get(
      "SELECT discord_id FROM users WHERE LOWER(ingame_name) = LOWER(?)",
      name
    );

    if (existingName && existingName.discord_id !== interaction.user.id) {
      return interaction.reply({
        content: `❌ El nombre **${name}** ya está registrado.`,
        flags: 64,
      });
    }

    const userRow = await db.get(
      "SELECT * FROM users WHERE discord_id = ?",
      interaction.user.id
    );

    if (userRow) {
      await db.run(
        "UPDATE users SET ingame_name = ? WHERE discord_id = ?",
        name,
        interaction.user.id
      );

      try {
        await member.setNickname(name);
      } catch (err) {
        console.log("Nickname change failed:", err);
      }

      return interaction.reply({
        content: `🔄 Se ha actualizado tu nombre a **${name}**!`,
        flags: 64,
      });
    }

    await db.run(
      "INSERT INTO users (discord_id, ingame_name) VALUES (?, ?)",
      interaction.user.id,
      name
    );

    try {
      await member.setNickname(name);
    } catch (err) {
      console.log("Nickname change failed:", err);
    }

    return interaction.reply({
      content: `✅ Registrado exitosamente: **${name}**!`,
      flags: 64,
    });
  },
};
