import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hammertime")
    .setDescription("Generate a hammertime timestamp for today at a specific hour.")
    .addIntegerOption(opt =>
      opt.setName("hour")
        .setDescription("Hour of the day (0–23)")
        .setMinValue(0)
        .setMaxValue(23)
        .setRequired(true)
    ),

  async execute(interaction) {
    const hour = interaction.options.getInteger("hour");

    // Current time (ms)
    const now = new Date();

    // Build today's date at the requested hour (local timezone)
    const target = new Date();
    target.setHours(hour, 0, 0, 0);

    // If the target time already passed today → move to tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    // Convert into Unix timestamp (seconds)
    const unix = Math.floor(target.getTime() / 1000);

    const full = `<t:${unix}:F>`;
    const relative = `<t:${unix}:R>`;
    const short = `<t:${unix}:t>`;

    await interaction.reply({
      content:
        `🕒 **Hammertime for ${hour}:00 (${target.toLocaleDateString()}):**\n` +
        `• **Full:** ${full}\n` +
        `• **Relative:** ${relative}\n` +
        `• **Short Time:** ${short}\n\n` +
        `Copy the one you need.`,
      ephemeral: false
    });
  }
};
