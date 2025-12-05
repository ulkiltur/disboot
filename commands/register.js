import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { SlashCommandBuilder } from "discord.js";

const sqlite = sqlite3.verbose();

export default {
  data: new SlashCommandBuilder()
    .setName("register")
    .setDescription("Registration or updating")
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("Your ingame-name")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Get the name safely
    const ingameName = interaction.options.getString("name");
    if (!ingameName) {
      return interaction.reply({
        content: "❌ Please provide a valid ingame name.",
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
        content: `❌ Name **${name}** is already registered.`,
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
        console.log("Ingame-name change failed:", err);
      }

      return interaction.reply({
        content: `🔄 Your ingame-name has been updated successfully to: **${name}**!`,
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
      content: `✅ Registration has been successful: welcome, **${name}**!`,
      flags: 64,
    });
  },
};
