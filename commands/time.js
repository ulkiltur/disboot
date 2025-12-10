import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hammertime")
    .setDescription("Generate a hammertime timestamp for today at a specific hour and minute.")
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
        .setRequired(false)
    ),

  async execute(interaction) {
    const hour = interaction.options.getInteger("hour");
    const minute = interaction.options.getInteger("minute") ?? 0;

    const now = new Date();

    // Build target time for today
    const target = new Date();
    target.setHours(hour, minute, 0, 0);

    // If the target already passed → move to tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const unix = Math.floor(target.getTime() / 1000);

    const full = `<t:${unix}:F>`;
    const relative = `<t:${unix}:R>`;
    const short = `<t:${unix}:t>`;

    // Calculate hours and minutes difference manually for extra info
    const diffSeconds = unix - Math.floor(now.getTime() / 1000);
    const diffHours = Math.floor(diffSeconds / 3600);
    const diffMinutes = Math.floor((diffSeconds % 3600) / 60);

    await interaction.reply({
    content:
        `🕒 **Hammertime for ${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')} (${target.toLocaleDateString()}):**\n` +
        `• **Full:** ${full}\n` +
        `• **Relative:** ${relative}\n` +
        `• **Short Time:** ${short}\n` +
        `• **Time until hammertime:** ${diffHours}h ${diffMinutes}m\n\n` +
        `This uses your local timezone. If daylight saving applies, Discord will show timestamps adjusted for everyone.`,
    ephemeral: true
    });
  }
};
