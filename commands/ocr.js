import { SlashCommandBuilder } from "discord.js";
import Tesseract from "tesseract.js";

const workerPromise = Tesseract.createWorker(); // Node resolves automatically

export default {
  data: new SlashCommandBuilder()
    .setName("ocr")
    .setDescription("Extract martial skills and goose score from WWM screenshot")
    .addAttachmentOption(opt =>
      opt.setName("image")
         .setDescription("Upload your screenshot")
         .setRequired(true)
    ),

  async execute(interaction) {
    const image = interaction.options.getAttachment("image");
    if (!image?.contentType?.startsWith("image/")) {
      return interaction.reply({ content: "❌ Upload a valid image file.", ephemeral: true });
    }

    // Use deferReply to avoid interaction timeout
    await interaction.deferReply();

    try {
      const worker = await workerPromise;

      const { data } = await worker.recognize(image.url, "eng");
      const text = data.text.replace(/\s+/g, " ").trim();

      const martialArts = ["Nameless Sword", "Strategic Sword", "Ninefold Umbrella", "Panacea Fan", "Inkwell Fan", "Stormbreaker Spear",
                            "Nameless Spear", "Heavenquaker Spear", "Soulshade Umbrella", "Infernal Twinblades", "Thundercry Blade",
                            "Mortal Rope Dart"  ];

      // Detect each martial art
      const detected = martialArts.map(name => {
        return `${name}: **${text.match(new RegExp(name, "i"))?.[0] ?? "❌"}**`;
      });

      // Detect goose score
      const gooseScore = text.match(/(\d+\.\d+)\s*(Goose|Goo0se)/i)?.[1] ?? "❌";

      // Build message
      const msg = `📝 **OCR text:**\n\`\`\`${text}\`\`\`\n\n🔎 Detected:\n• ${detected.join("\n• ")}\n• Goose Score: **${gooseScore}**`;

      await interaction.editReply(msg);


    } catch (err) {
      console.error("OCR failed:", err);
      await interaction.editReply("❌ OCR failed.");
    }
  }
};

// terminate worker on exit
process.on("exit", async () => {
  const worker = await workerPromise;
  await worker.terminate();
});
