import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { SlashCommandBuilder } from "discord.js";

export default{
  data: new SlashCommandBuilder()
  .setName("registro")
  .setDescription("Registrar o actualizar")
  .addStringOption(option =>
    option
      .setName("name")
      .setDescription("Your in-game name")
      .setRequired(true)
  ),

async execute(interaction) {
  const ingameName = interaction.options.getString("name").trim();
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);

  // Open DB
  const db = await open({
    filename: "./database/users.sqlite",
    driver: sqlite3.Database
  });

  // Create table if not exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      ingame_name TEXT
    );
  `);

  // Case-insensitive check
  const existingName = await db.get(
    "SELECT discord_id FROM users WHERE LOWER(ingame_name) = LOWER(?)",
    ingameName
  );

  // If name belongs to someone else → block
  if (existingName && existingName.discord_id !== interaction.user.id) {
    return await interaction.reply({
      content: `❌ El nombre **${ingameName}** ya está registrado.`,
      ephemeral: true
    });
  }

  // Check if this user already registered
  const userRow = await db.get(
    "SELECT * FROM users WHERE discord_id = ?",
    interaction.user.id
  );

  if (userRow) {
    // ⭐ Update existing record
    await db.run(
      "UPDATE users SET ingame_name = ? WHERE discord_id = ?",
      ingameName,
      interaction.user.id
    );

    // Update Discord nickname
    try {
      await member.setNickname(ingameName);
    } catch (err) {
      console.log("Nickname change failed:", err);
    }

    return await interaction.reply({
      content: `🔄 Se ha actualizado to nombre a **${ingameName}**!`,
      ephemeral: true
    });
  }

  // ⭐ Insert new record
  await db.run(
    "INSERT INTO users (discord_id, ingame_name) VALUES (?, ?)",
    interaction.user.id,
    ingameName
  );

  // Update Discord nickname
  try {
    await member.setNickname(ingameName);
  } catch (err) {
    console.log("Nickname change failed:", err);
  }

  return await interaction.reply({
    content: `✅ Registrado exitosamente: **${ingameName}**!`,
    ephemeral: true
  });
}
