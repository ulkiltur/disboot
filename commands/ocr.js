import { SlashCommandBuilder } from "discord.js";
import Tesseract from "tesseract.js";

// create a worker once
const workerPromise = Tesseract.createWorker(); // <-- no paths

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

    await interaction.reply("🔍 Reading image…");

    try {
      const worker = await workerPromise;

      // pass language as string to recognize (v5.1)
      const { data } = await worker.recognize(image.url, "eng");
      const text = data.text.replace(/\s+/g, " ").trim();

      const martial1 = text.match(/Nameless Sword/i)?.[0] ?? null;
      const martial2 = text.match(/Strategic Sword/i)?.[0] ?? null;
      const gooseScore = text.match(/(\d+\.\d+)\s*Goose/i)?.[1] ?? null;

      let msg = `📝 **OCR text:**\n\`\`\`${text}\`\`\``;
      msg += `\n\n🔎 Detected:`;
      msg += `\n• Nameless Sword: **${martial1 ?? "❌"}**`;
      msg += `\n• Strategic Sword: **${martial2 ?? "❌"}**`;
      msg += `\n• Goose Score: **${gooseScore ?? "❌"}**`;

      return interaction.editReply(msg);

    } catch (err) {
      console.error("OCR failed:", err);
      return interaction.editReply("❌ OCR failed.");
    }
  }
};

process.on("exit", async () => {
  const worker = await workerPromise;
  await worker.terminate();
});
