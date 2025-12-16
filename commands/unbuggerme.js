export default {
  data: new SlashCommandBuilder()
    .setName("cancel_reminders")
    .setDescription("Stop receiving DM event reminders"),

  async execute(interaction) {
    await db.run(
      "UPDATE dm_consent SET consent=0 WHERE user_id=?",
      interaction.user.id
    );

    await interaction.reply({
      ephemeral: true,
      content: "🛑 You will no longer receive DM reminders."
    });
  }
};
