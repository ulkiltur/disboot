import { SlashCommandBuilder } from "discord.js";
import Tesseract from "tesseract.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Fuse from "fuse.js";
import { AttachmentBuilder } from "discord.js";

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

    const response = await fetch(image.url);
    const buffer = await response.arrayBuffer();
    const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: 'screenshot.png' });

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
        // English
        "Nameless Sword", "Strategic Sword", "Ninefold Umbrella", "Panacea Fan",
        "Inkwell Fan", "Stormbreaker Spear", "Nameless Spear", "Heavenquaker Spear",
        "Soulshade Umbrella", "Infernal Twinblades", "Thundercry Blade", "Mortal Rope Dart",

        // Spanish
        "Espada Estratégica", "Espada Sin Nombre", "Lanza Sin Nombre",
        "Espadas Gemelas Infernales", "Lanza del Temblor Celestial", "Abanico Panacea",
        "Sombrilla Primaveral", "Lanza Rompetormentas", "Espada del Trueno",
        "Abanico del Tintero", "Sombrilla de las Almas", "Dardo Mortal",

        // French
        "Lames Jumelles Infernales",       // Infernal Twinblades
        "Épée Stratégique",
        "Epée Stratégique",                // Strategic Sword
        "Éventail Panacée",                // Panacea Fan
        "Épée Sans Nom",
        "Epée Sans Nom",                   // Nameless Sword
        "Parapluie des Âmes",              // Soulshade Umbrella
        "Parapluie Printanier",            // Ninefold Umbrella
        "Lame du Tonnerre",                // Thundercry Blade
        "Éventail Encrier",                // Inkwell Fan
        "Lance Sans Nom",                  // Nameless Spear
        "Lance Fende-Tempête",             // Stormbreaker Spear
        "Lance Ébranle-Ciel",              // Heavenquaker Spear
        "Dard Mortel",                     // Mortal Rope Dart

        // German
        "Höllische Zwillingsklingen",      // Infernal Twinblades
        "Strategisches Schwert",           // Strategic Sword
        "Allheilfächer",
        "Allheilficher",                   // Panacea Fan
        "Namenloses Schwert",              // Nameless Sword
        "Seelenschattenschirm",            // Soulshade Umbrella
        "Frühlingsschirm",
        "Frithlingsschirm",                 // Ninefold Umbrella
        "Donnerruf-Klinge",                // Thundercry Blade
        "Tintenfassfächer",                // Inkwell Fan
        "Namenlose Speer",                 // Nameless Speer (OCR quirk)
        "Sturmbrecher-Speer",              // Stormbreaker Spear
        "Himmelserschütterer Speer",       // Heavenquaker Spear
        "Todesseilpfeil"                   // Mortal Rope Dart
      ];


      function normalizeText(str) {
        return str
          .normalize("NFD")                // normalize accents
          .replace(/[\u0300-\u036f]/g, "") // remove diacritics
          .replace(/[^\w\s]/g, " ")        // remove symbols like *, /, \, |
          .replace(/\s+/g, " ")            // normalize multiple spaces
          .trim()
          .toLowerCase();                  // lowercase for easy matching
      }

      function isWeaponDetected(weaponName, ocrText) {
        const cleanOCR = normalizeText(ocrText);
        const cleanWeapon = normalizeText(weaponName);

        const words = cleanWeapon.split(" ");
        const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".{0,5}");
        const regex = new RegExp(pattern, "i");

        return regex.test(cleanOCR);
      }

      const detected = martialArts.map(name => {
        const found = isWeaponDetected(name, text);
        return {
          name,
          found,
          raw: `${name}: **${found ? name : "❌"}**`
        };
      });

      // -----------------------------------------
      // SCORE DETECTION (3 METHOD PRIORITY ORDER)
      // -----------------------------------------
      const scoreText = text
        .replace(/Goo0se/gi, "Goose")
        .replace(/Coose/gi, "Goose")
        .replace(/0oose/gi, "Goose")
        .replace(/Coo0se/gi, "Goose")
        .replace(/Gan5o/gi, "Goose")
        .replace(/Gans/gi, "Goose")
        .replace(/Oie/gi, "Goose")
        .replace(/Go0se/gi, "Goose");

      const normalizedText = normalizeText(text);

      // Match variants of "Goose" or "Ganso" with some OCR errors
      const scorePattern = /(\d+(?:\.\d+)?)\s*Goose/i;
      const scoreMatch = scoreText.match(scorePattern);

      let gooseScore = 0;
      if (scoreMatch) {
        gooseScore = parseFloat(scoreMatch[1]);
      } else {
        // fallback: last 5-digit number → X.XXXX
        const fiveDigits = normalizedText.match(/\b\d{5}\b/g);
        if (fiveDigits?.length) {
          gooseScore = parseInt(fiveDigits[fiveDigits.length - 1], 10) / 10000;
        }
      }

      // final fallback
      if (!gooseScore) gooseScore = 0;

      gooseScore = gooseScore.toFixed(3);

      // -------------------------------------
      // ROLE DETECTION
      // -------------------------------------
      const hasWeapon = (names) => {
        if (Array.isArray(names)) {
          return names.some(n => detected.some(d => d.name === n && d.found));
        }
        return detected.some(d => d.name === names && d.found);
      };

      let role = "Melee DPS";

      if (
        hasWeapon([
          "Panacea Fan", "Abanico Panacea", "Éventail Panacée", "Allheilfächer", "Allheilficher"
        ]) &&
        hasWeapon([
          "Soulshade Umbrella", "Sombrilla de las Almas", "Parapluie des Âmes", "Seelenschattenschirm"
        ])
      ) {
        role = "Healer";
      } 
      // Tank
      else if (
        hasWeapon([
          "Stormbreaker Spear", "Lanza Rompetormentas", "Lance Fende-Tempête", "Sturmbrecher-Speer"
        ]) &&
        hasWeapon([
          "Thundercry Blade", "Espada del Trueno", "Lame du Tonnerre", "Donnerruf-Klinge"
        ])
      ) {
        role = "Tank";
      } 
      // Ranged DPS
      else if (
        hasWeapon([
          "Ninefold Umbrella", "Sombrilla Primaveral", "Parapluie Printanier", "Frühlingsschirm", "Frithlingsschirm"
        ]) &&
        hasWeapon([
          "Inkwell Fan", "Abanico del Tintero", "Éventail Encrier", "Tintenfassfächer"
        ])
      ) {
        role = "Ranged DPS";
      }

      const seen = new Set();

      const detectedList = detected
        .filter(w => w.found)
        .filter(w => {
          const normalized = w.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .map(w => `        • ${w.raw}`) // add spaces to match template indentation
        .join("\n");

      const msg =
        `📝 **Detected Info**
        • **Role:** ${role}
        ${detectedList ? detectedList + "\n" : ""}
        • **Score (Goose):** ⭐ **${gooseScore}**`;



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

      // -------------------------------------
      // SEND IMAGE TO A LOG CHANNEL
      // -------------------------------------

      // Replace with your channel ID
      const LOG_CHANNEL_ID = "1447698250323857622";

      try {
        const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);

        await logChannel.send({
          content: `📸 **New Goose Upload**  
        **In-Game:** ${ingameName ?? "Unknown"}  
        **Role:** ${role}  
        **Score:** ⭐ ${gooseScore}
        📄 **OCR Text Detected:**
        \`\`\`
        ${text}
        \`\`\``,
          files: [attachment]
        });

      } catch (err) {
        console.error("Failed to send screenshot:", err);
      }


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

  const translationMap = {
  // --- Spanish → English ---
  "Espada Estratégica": "Strategic Sword",
  "Espada Sin Nombre": "Nameless Sword",
  "Lanza Sin Nombre": "Nameless Spear",
  "Espadas Gemelas Infernales": "Infernal Twinblades",
  "Lanza del Temblor Celestial": "Heavenquaker Spear",
  "Abanico Panacea": "Panacea Fan",
  "Sombrilla Primaveral": "Ninefold Umbrella",
  "Lanza Rompetormentas": "Stormbreaker Spear",
  "Espada del Trueno": "Thundercry Blade",
  "Abanico del Tintero": "Inkwell Fan",
  "Sombrilla de las Almas": "Soulshade Umbrella",
  "Dardo Mortal": "Mortal Rope Dart",

  // --- French → English ---
  "Oie": "Goose",  // OCR keyword
  "Lames Jumelles Infernales": "Infernal Twinblades",
  "Épée Stratégique": "Strategic Sword",
  "Epée Stratégique": "Strategic Sword",     // OCR without accent
  "Éventail Panacée": "Panacea Fan",
  "Eventail Panacée": "Panacea Fan",
  "Épée Sans Nom": "Nameless Sword",
  "Epée Sans Nom": "Nameless Sword",
  "Parapluie des Âmes": "Soulshade Umbrella",
  "Parapluie des Ames": "Soulshade Umbrella", // no accent
  "Parapluie Printanier": "Ninefold Umbrella",
  "Lame du Tonnerre": "Thundercry Blade",
  "Éventail Encrier": "Inkwell Fan",
  "Eventail Encrier": "Inkwell Fan",
  "Lance Sans Nom": "Nameless Spear",
  "Lance Fende-Tempête": "Stormbreaker Spear",
  "Lance Fende Tempête": "Stormbreaker Spear",
  "Lance Ébranle-Ciel": "Heavenquaker Spear",
  "Lance Ebranle-Ciel": "Heavenquaker Spear",
  "Dard Mortel": "Mortal Rope Dart",

  // --- German → English ---
  "Gans": "Goose",
  "Höllische Zwillingsklingen": "Infernal Twinblades",
  "Strategisches Schwert": "Strategic Sword",
  "Allheilfächer": "Panacea Fan",
  "Allheilficher": "Panacea Fan",
  "Namenloses Schwert": "Nameless Sword",
  "Seelenschattenschirm": "Soulshade Umbrella",
  "Frühlingsschirm": "Ninefold Umbrella",
  "Frithlingsschirm": "Ninefold Umbrella",
  "Donnerruf-Klinge": "Thundercry Blade",
  "Tintenfassfächer": "Inkwell Fan",
  "Namenlose Speer": "Nameless Spear", // OCR variant
  "Sturmbrecher-Speer": "Stormbreaker Spear",
  "Himmelserschütterer Speer": "Heavenquaker Speer",
  "Todesseilpfeil": "Mortal Rope Dart"
};



  const weaponNames = detectedWeapons
  .filter(w => w.found)
  .map(w => translationMap[w.name] ?? w.name); // translate if possible
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
