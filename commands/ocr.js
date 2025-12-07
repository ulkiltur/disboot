import { SlashCommandBuilder } from "discord.js";
import Tesseract from "tesseract.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Fuse from "fuse.js";

const sqlite = sqlite3.verbose();

const workerPromise = Tesseract.createWorker(); 

export default {
  data: new SlashCommandBuilder()
    .setName("goose")
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

    await interaction.deferReply({ ephemeral: true });

    try {
      const worker = await workerPromise;
      const { data } = await worker.recognize(image.url, "eng");
      const text = data.text.replace(/\s+/g, " ").trim();

      // -------------------------------------
      // Detect ID: 10 digits
      // -------------------------------------
      let playerId = null;
      const idMatch = text.match(/ID[:\s]*([0-9]{10})/i);
      if (idMatch) {
        playerId = idMatch[1];
      }

      // --------------------------
      // Martial Arts list
      // --------------------------
      const martialArts = [
        "Nameless Sword", "Strategic Sword", "Ninefold Umbrella", "Panacea Fan",
        "Inkwell Fan", "Stormbreaker Spear", "Nameless Spear", "Heavenquaker Spear",
        "Soulshade Umbrella", "Infernal Twinblades", "Thundercry Blade", "Mortal Rope Dart",

        // Spanish
        "Espada Estratégica", "Espada Sin Nombre", "Lanza Sin Nombre",
        "Espadas Gemelas Infernales", "Lanza del Temblor Celestial", "Abanico Panacea",
        "Sombrilla Primaveral", "Lanza Rompetormentas", "Espada del Trueno",
        "Abanico del Tintero", "Sombrilla de las Almas", "Dardo Mortal"
      ];

      const fuse = new Fuse([text], {
        includeScore: true,
        threshold: 0.5,   // higher = more tolerant
        ignoreLocation: true,
        useExtendedSearch: true
      });

      const detected = martialArts.map(name => {
        const result = fuse.search(name)[0];
        const found = result && result.score < 0.5;
        return {
          name,
          found,
          raw: `${name}: **${found ? name : "❌"}**`
        };
      });



      // -----------------------------------------
      // SCORE DETECTION (3 METHOD PRIORITY ORDER)
      // -----------------------------------------

      let gooseScore = 0;

      // 1️⃣ Normal Goose/Ganso detection
      const scorePattern = /(\d+(?:\.\d+)?)[^\dA-Za-z]{0,5}(Goose|Goo0se|Coose|0oose|Coo0se|Ganso|Gan5o)/i;
      const scoreMatch = text.match(scorePattern);

      if (scoreMatch) {
        gooseScore = parseFloat(scoreMatch[1]);
      }

      // 2️⃣ If not found: detect 5-digit raw score (XXXXX → X.XXXX)
      if (!gooseScore) {
        const fiveDigits = text.match(/\b\d{5}\b/g);
        if (fiveDigits && fiveDigits.length) {
          gooseScore = parseInt(fiveDigits[fiveDigits.length - 1]) / 10000;
        }
      }


      // 3️⃣ If still not found → fallback to 0
      if (!gooseScore) gooseScore = 0;

      // -------------------------------------
      // ROLE DETECTION
      // -------------------------------------
      const hasWeapon = (n) => detected.some(d => d.name === n && d.found);

      let role = "Melee DPS";

      if (
        (hasWeapon("Panacea Fan") && hasWeapon("Soulshade Umbrella"))
        || (hasWeapon("Abanico Panacea") && hasWeapon("Sombrilla de las Almas"))
      ) {
        role = "Healer";
      } 
      else if ((hasWeapon("Stormbreaker Spear") && hasWeapon("Thundercry Blade"))
        || (hasWeapon("Lanza Rompetormentas") && hasWeapon("Espada del Trueno"))) {
        role = "Tank";
      } 
      else if ((hasWeapon("Ninefold Umbrella") && hasWeapon("Inkwell Fan"))
        || (hasWeapon("Sombrilla Primaveral") && hasWeapon("Abanico del Tintero"))) {
        role = "Ranged DPS";
      }

      const detectedList = detected
        .filter(w => w.found)
        .map(w => `• ${w.raw}`)
        .join("\n");

      const msg =
      `📝 **Detected Info**
      • **Role:** ${role}
      ${detectedList ? detectedList + "\n" : ""}
      • **Score (Goose/Ganso):** ⭐ **${gooseScore}**
      📸 **OCR Text:** 
      \`\`\`
      ${text}
      \`\`\``;


      await interaction.editReply(msg);

      // -------------------------------------
      // Save skills
      // -------------------------------------
      const db = await open({
        filename: "/var/data/users.sqlite",
        driver: sqlite.Database,
      });

      const row = await db.get(
        "SELECT ingame_name FROM users WHERE discord_id = ?",
        interaction.user.id
      );

      const ingameName = row ? row.ingame_name : null;

      await saveSkills(interaction.user.id, ingameName, playerId, role, detected, gooseScore);

    } catch (err) {
      console.error("OCR failed:", err);
      await interaction.editReply("❌ OCR failed.");
    }
  }
};

// Worker cleanup
process.on("exit", async () => {
  const worker = await workerPromise;
  await worker.terminate();
});

// -------------------------------------
// saveSkills FUNCTION (unchanged)
// -------------------------------------
async function saveSkills(discordId, ingameName, playerId, role, detectedWeapons, score) {
  const db = await open({
    filename: "/var/data/users.sqlite",
    driver: sqlite.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      discord_id TEXT NOT NULL,
      ingame_name TEXT NOT NULL,
      playerId TEXT,
      role TEXT NOT NULL,
      weapon1 TEXT,
      weapon2 TEXT,
      score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(discord_id, ingame_name, weapon1, weapon2)
    );
  `);

  const weaponNames = detectedWeapons.filter(w => w.found).map(w => w.name);
  const weapon1 = weaponNames[0] ?? null;
  const weapon2 = weaponNames[1] ?? null;

  if (!weapon1 && !weapon2) {
    console.log(`No weapons detected for ${ingameName} (${discordId}), skipping save.`);
    await db.close();
    return;
  }

  const existing = await db.get(
    "SELECT * FROM skills WHERE discord_id = ? AND ingame_name = ? AND weapon1 = ? AND weapon2 = ?",
    discordId,
    ingameName,
    weapon1,
    weapon2
  );


  if (existing) {
      await db.run(
        "UPDATE skills SET score = ?, playerId = ?, role = ?, created_at = CURRENT_TIMESTAMP WHERE discord_id = ? AND ingame_name = ? AND weapon1 = ? AND weapon2 = ?",
        score,
        playerId,
        role,
        discordId,
        ingameName,
        weapon1,
        weapon2
      );
    
  } else {
    await db.run(
      "INSERT INTO skills (discord_id, ingame_name, playerId, role, weapon1, weapon2, score) VALUES (?, ?, ?, ?, ?, ?, ?)",
      discordId,
      ingameName,
      playerId,
      role,
      weapon1,
      weapon2,
      score
    );
  }

  await db.close();
}
