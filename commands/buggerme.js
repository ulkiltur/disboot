import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("set_reminder")
    .setDescription("Opt in to DM reminders for scheduled events"),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("dm_accept")
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("dm_decline")
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      ephemeral: true,
      content:
        "📬 **DM Notification Agreement**\n\n" +
        "By accepting, you allow the bot to send you **direct messages** " +
        "with reminders **30 minutes before scheduled events**.\n\n" +
        "You can opt out anytime with `/unbuggerme`.",
      components: [row]
    });
  }
};
