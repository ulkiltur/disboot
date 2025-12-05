import { SlashCommandBuilder } from "discord.js";
import Tesseract from "tesseract.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const sqlite = sqlite3.verbose();

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
      // Matches a number immediately before "Goose", "Goo0se", or OCR variants
      const match = text.match(/(\d+(?:\.\d+)?)(?:[^\dA-Za-z]{0,5})(Goose|Goo0se|Coose|0oose|Coo0se)/i);

      const gooseScore = match ? parseFloat(match[1]) : 0;

      var role = "Unknown Role";

      if(
        (detected[0].includes("Panacea Fan") || detected[1].includes("Panacea Fan"))
         && (detected[0].includes("Soulshade Umbrella") || detected[1].includes("Soulshade Umbrella"))
        ){
        role = "Healer";
      }
      else if(
        (detected[0].includes("Stormbreaker Spear") || detected[1].includes("Stormbreaker Spear"))
         && (detected[0].includes("Thundercry Blade") || detected[1].includes("Thundercry Blade"))
        ){
        role = "Tank";
      }
      else if(
        (detected[0].includes("Ninefold Umbrella") || detected[1].includes("Ninefold Umbrella"))
         && (detected[0].includes("Inkwell Fan") || detected[1].includes("Inkwell Fan"))
        ){
        role = "Ranged DPS";
      }
      else{
        role = "Melee DPS";
      }

      const msg = `📝 **OCR text:**\n\`\`\`${text}\`\`\`\n\n🔎 Detected:\n• ${role}\n• ${detected.join("\n• ")}\n• Goose Score: **${gooseScore}**`;

      await interaction.editReply(msg);

      const db = await open({
        filename: "/var/data/users.sqlite", // persistent path
        driver: sqlite.Database,
      });

      const row = await db.get(
        "SELECT ingame_name FROM users WHERE discord_id = ?",
        interaction.user.id
      );

      const ingameName = row ? row.ingame_name : null;

      await saveSkills(interaction.user.id, ingameName, role, detected, gooseScore);

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

async function saveSkills(discordId, ingameName, role, detectedWeapons, score) {
  const db = await open({
    filename: "/var/data/users.sqlite", // persistent path
    driver: sqlite.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      discord_id TEXT NOT NULL,
      ingame_name TEXT NOT NULL,
      role TEXT NOT NULL,
      weapon1 TEXT,
      weapon2 TEXT,
      score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(discord_id)
    );
  `);

  const weapon1 = detectedWeapons[0] ?? null;
  const weapon2 = detectedWeapons[1] ?? null;

  // Check if entry exists
  const existing = await db.get(
    "SELECT * FROM skills WHERE discord_id = ?",
    discordId
  );

  if (existing) {
    await db.run(
      "UPDATE skills SET ingame_name = ?, role = ?, weapon1 = ?, weapon2 = ?, score = ? WHERE discord_id = ?",
      ingameName,
      role,
      weapon1,
      weapon2,
      score,
      discordId,
      role
    );
  } else {
    await db.run(
      "INSERT INTO skills (discord_id, ingame_name, role, weapon1, weapon2, score) VALUES (?, ?, ?, ?, ?, ?)",
      discordId,
      ingameName,
      role,
      weapon1,
      weapon2,
      score
    );
  }

  await db.close();
}
