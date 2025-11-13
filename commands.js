export const ping = {
  data: {
    name: 'ping',
    description: 'Replies with Pong!'
  },
  async execute(interaction) {
    await interaction.reply('Pong!');
  }
};

export const say = {
  data: {
    name: 'say',
    description: 'Repeats your message',
    options: [
      {
        name: 'text',
        type: 3, // STRING
        description: 'Text to repeat',
        required: true
      }
    ]
  },
  async execute(interaction) {
    const text = interaction.options.getString('text');
    await interaction.reply(text);
  }
};
