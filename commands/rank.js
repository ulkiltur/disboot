import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export default {
  data: new SlashCommandBuilder()
    .setName("rankings")
    .setDescription("Show top 30 players per role based on score"),

  async execute(interaction) {
    await interaction.deferReply(); // in case DB query takes a moment

    // Open DB
    const db = await open({
      filename: "/var/data/users.sqlite",
      driver: sqlite3.Database,
    });

    try {
      const roles = ["Healer", "Tank", "Ranged DPS", "Melee DPS"];
      const embed = new EmbedBuilder()
        .setTitle("🏆 WWM Top Rankings")
        .setColor("Gold")
        .setTimestamp();

      for (const role of roles) {
        // Fetch top 5 by score for this role
        const rows = await db.all(
          "SELECT ingame_name, weapon1, weapon2, score FROM skills WHERE role = ? ORDER BY score DESC LIMIT 30",
          role
        );

        if (rows.length === 0) {
          embed.addFields({
            name: role,
            value: "❌ No players found",
          });
          continue;
        }

        // Build ranking text
        const rankingText = rows
          .map(
            (r, i) =>
              `**${i + 1}. ${r.ingame_name}** — ${r.weapon1 ?? "❌"} / ${
                r.weapon2 ?? "❌"
              } — Score: ${r.score}`
          )
          .join("\n");

        embed.addFields({
          name: role,
          value: rankingText,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("Failed to fetch rankings:", err);
      await interaction.editReply("❌ Failed to fetch rankings.");
    } finally {
      await db.close();
    }
  },
};
