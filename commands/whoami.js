import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { SlashCommandBuilder } from "discord.js";

const sqlite = sqlite3.verbose();

export default {
  data: new SlashCommandBuilder()
    .setName("whoami")
    .setDescription("Check your profile"),

  async execute(interaction) {
    const discordId = interaction.user.id;

    // Open DB
    const db = await open({
      filename: "/var/data/users.sqlite",
      driver: sqlite.Database
    });

    // Fetch user info
    const userRow = await db.get(
      "SELECT ingame_name FROM users WHERE discord_id = ?",
      discordId
    );

    if (!userRow) {
      return interaction.reply({
        content: "❌ Not registered. Use /register <ingame-name>.",
        flags: 64
      });
    }

    const tableExists = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='skills';"
    );
    
    let skillRows = [];
    if (tableExists) {
      skillRows = await db.all(
        "SELECT role, weapon1, weapon2, score, created_at FROM skills WHERE discord_id = ?",
        discordId
      );
    }

    let skillText = "";
    if (skillRows.length === 0) {
      skillText = "❌ No skills found.";
    } else {
      skillText = skillRows.map(s => 
        `🗡 **Role:** ${s.role}\n` +
        `• Weapon 1: ${s.weapon1 ?? "❌"}\n` +
        `• Weapon 2: ${s.weapon2 ?? "❌"}\n` +
        `• Score: ${s.score ?? "❌"}\n`
      ).join("\n\n");
    }

    return interaction.reply({
      content: `✅ Hello, **${userRow.ingame_name}**.\n\n${skillText}`,
      flags: 64
    });
  }
};
