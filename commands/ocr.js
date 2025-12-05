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

      const martial1 = text.match(/Nameless Sword/i)?.[0] ?? "❌";
      const martial2 = text.match(/Strategic Sword/i)?.[0] ?? "❌";
      const gooseScore = text.match(/(\d+\.\d+)\s*Goose/i)?.[1] ?? "❌";

      const msg = `📝 **OCR text:**\n\`\`\`${text}\`\`\`\n\n🔎 Detected:\n• Nameless Sword: **${martial1}**\n• Strategic Sword: **${martial2}**\n• Goose Score: **${gooseScore}**`;

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
