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
      filename: "/var/data/users.sqlite", // persistent path
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

    await db.run(
      `INSERT INTO dm_consent (user_id, consent, agreed_at)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET consent=1, agreed_at=?`,
      userId,
      Date.now(),
      Date.now()
    );

    const LOG_CHANNEL_ID = "1447698250323857622";

    // LOG: Registration
    try {
      const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
      await logChannel.send({
        content: `🟢 **New Registration**
    **Ingame Name:** ${name}`,
      });
    } catch (err) {
      console.error("Failed to send register log:", err);
    }


    return interaction.reply({
      content: `✅ Registration has been successful: welcome, **${name}**!`,
      flags: 64,
    });
  },
};
