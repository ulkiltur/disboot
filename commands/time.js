import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hammertime")
    .setDescription("Generate a hammertime timestamp at a specific hour, minute, and timezone offset.")
    .addIntegerOption(opt =>
      opt.setName("hour")
        .setDescription("Hour of the day (0–23)")
        .setMinValue(0)
        .setMaxValue(23)
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("minute")
        .setDescription("Minute of the hour (0–59)")
        .setMinValue(0)
        .setMaxValue(59)
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("utc_offset")
        .setDescription("Your UTC offset in hours (e.g., +1, 0, -5)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const hour = interaction.options.getInteger("hour");
    const minute = interaction.options.getInteger("minute");
    const tzOffset = interaction.options.getInteger("utc_offset") || 0;

    const now = new Date();

    // Build target date in local time
    const target = new Date();
    target.setHours(hour, minute, 0, 0);

    // If target already passed today → move to tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    // Convert to Unix timestamp and adjust for UTC offset
    const unix = Math.floor(target.getTime() / 1000) - (tzOffset * 3600);

    // Discord timestamps
    const full = `<t:${unix}:F>`;
    const relative = `<t:${unix}:R>`;
    const short = `<t:${unix}:t>`;

    // Time until hammertime
    const diffSeconds = unix - Math.floor(now.getTime() / 1000);
    const diffHours = Math.floor(diffSeconds / 3600);
    const diffMinutes = Math.floor((diffSeconds % 3600) / 60);

    await interaction.reply({
      content:
        `🕒 **Hammertime for ${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')} (UTC${tzOffset >= 0 ? '+' : ''}${tzOffset}):**\n\n` +
        `• **Rendered:** ${raw}\n` +
        `• **Copyable:** ${rawCode}\n\n` +
        `• **Relative:** <t:${unix}:R>\n` +
        `• **Short:** <t:${unix}:t>\n\n` +
        `• **Time until hammertime:** ${diffHours}h ${diffMinutes}m\n\n` +
        `Copy the code version to reuse the timestamp.`,
      flags: 64
    });

  }
};
