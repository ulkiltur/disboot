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
                            "Mortal Rope Dart"];

      // Detect each martial art
      const detected = martialArts.map(name => {
        const found = text.match(new RegExp(name, "i"))?.[0] ?? null;
        return {
          name,
          found: found !== null,
          raw: `${name}: **${found ?? "❌"}**`
        };
      });


      // Detect goose score
      // Matches a number immediately before "Goose", "Goo0se", or OCR variants
      const match = text.match(/(\d+(?:\.\d+)?)(?:[^\dA-Za-z]{0,5})(Goose|Goo0se|Coose|0oose|Coo0se)/i);

      const gooseScore = match ? parseFloat(match[1]) : 0;


      // Default role
      function hasWeapon(name, detected) {
        return detected.some(d => d.name === name && d.found === true);
      }


      let role = "Melee DPS";

      if (hasWeapon("Panacea Fan", detected) && hasWeapon("Soulshade Umbrella", detected)) {
        role = "Healer";
      }
      else if (hasWeapon("Stormbreaker Spear", detected) && hasWeapon("Thundercry Blade", detected)) {
        role = "Tank";
      }
      else if (hasWeapon("Ninefold Umbrella", detected) && hasWeapon("Inkwell Fan", detected)) {
        role = "Ranged DPS";
      }

      const msg = `📝 **OCR text:**\n\`\`\`${text}\`\`\`\n\n🔎 Detected:\n• ${role}\n• ${detected.map(w => w.raw).join("\n• ")}• Goose Score: **${gooseScore}**`;

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
    filename: "/var/data/users.sqlite",
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

  const weaponNames = detectedWeapons
  .filter(w => w.found)
  .map(w => w.name);

  const weapon1 = weaponNames[0] ?? null;
  const weapon2 = weaponNames[1] ?? null;

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
      discordId
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

  const msg = `📝Skills saved for **${ingameName ?? "Unknown"}**: Role: **${role}**, Weapon 1: **${weapon1 ?? "❌"}**, Weapon 2: **${weapon2 ?? "❌"}**, Goose Score: **${score}**.`;

  await interaction.deferReply(msg);

  await db.close();
}
