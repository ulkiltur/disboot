import { SlashCommandBuilder } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Fuse from "fuse.js";
import { AttachmentBuilder } from "discord.js";
import sharp from "sharp";
import { martialArts } from "../data/weapons.js";
import { translationMap } from "../data/translationMap.js";
import { workerPromise } from "../server.js";

const sqlite = sqlite3.verbose();



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
    try {
    console.log("Step 1: Fetching image");
    const image = interaction.options.getAttachment("image");
    console.log("Step 2");
    if (!image?.contentType?.startsWith("image/")) {
      return interaction.reply({ content: "❌ Upload a valid image file.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const response = await fetch(image.url);
    const buffer = await response.arrayBuffer();
    let imageBuffer = Buffer.from(buffer);
    const meta = await sharp(imageBuffer).metadata();
    const W = meta.width;
    const H = meta.height;
    const scoreRegion = {
      left: Math.floor(W * 0.70),
      top: Math.floor(H * 0.08),
      width: Math.floor(W * 0.22),
      height: Math.floor(H * 0.12),
    };

    const weaponRegion1 = {
      left: Math.floor(W * 0.08),
      top: Math.floor(H * 0.24),
      width: Math.floor(W * 0.33),
      height: Math.floor(H * 0.08),
    };

    const weaponRegion2 = {
      left: Math.floor(W * 0.08),
      top: Math.floor(H * 0.33),
      width: Math.floor(W * 0.33),
      height: Math.floor(H * 0.08),
    };

    const idRegion = {
      left: Math.floor(W * 0.03),
      top: Math.floor(H * 0.87),
      width: Math.floor(W * 0.40),
      height: Math.floor(H * 0.10),
    };

    console.log("Step 3");
    const [scoreBuf, wepBuf, wep2Buf, idBuf] = await Promise.all([
      sharp(imageBuffer).extract(scoreRegion).toBuffer(),
      sharp(imageBuffer).extract(weaponRegion1).toBuffer(),
      sharp(imageBuffer).extract(weaponRegion2).toBuffer(),
      sharp(imageBuffer).extract(idRegion).toBuffer()
    ]);


    const [cleaned, cleaned2, cleaned3, cleaned4] = await Promise.all([
      sharp(scoreBuf)
        .grayscale()
        .threshold(140)
        .toBuffer(),

      sharp(wepBuf)
        .grayscale()
        .threshold(140)
        .toBuffer(),

      sharp(wep2Buf)
      .grayscale()
      .threshold(140)
      .toBuffer(),

      sharp(idBuf)
      .grayscale()
      .threshold(140)
      .toBuffer()
    ]);

    console.log("Step 4");
    const worker = await workerPromise;
    await worker.load();                // load Tesseract core
    await worker.loadLanguage("eng");   // load English
    await worker.initialize("eng");     // initialize with English

    console.log("Step 5");
    // OCR for score
    const [scoreData, weaponData1, weaponData2, idData] = await Promise.all([
      worker.recognize(cleaned, "eng"),
      worker.recognize(cleaned2, "eng"),
      worker.recognize(cleaned3, "eng"),
      worker.recognize(cleaned4, "eng"),
    ]);

    console.log("Step 6");
    const scoreText = scoreData.text.replace(/\s+/g, " ").trim();

    // OCR for weapon
    const weaponText1 = weaponData1.text.replace(/\s+/g, " ").trim();

    const weaponText2 = weaponData2.text.replace(/\s+/g, " ").trim();

    const idText = idData.text.replace(/\s+/g, " ").trim();

    const idMatch = idText.match(/ID[:\s]*([0-9]{10})/i);
    const playerId = idMatch ? idMatch[1] : null;


    function normalizeText(str) {
      return str
        .normalize("NFD")                // normalize accents
        .replace(/[\u0300-\u036f]/g, "") // remove diacritics
        .replace(/[^\w\s]/g, " ")        // remove symbols like *, /, \, |
        .replace(/\s+/g, " ")            // normalize multiple spaces
        .trim()
        .toLowerCase();                  // lowercase for easy matching
    }

    console.log("Step 7");
    function isWeaponDetected(weaponName, ocrText) {
      const cleanOCR = normalizeText(ocrText);
      const cleanWeapon = normalizeText(weaponName);

      const words = cleanWeapon.split(" ");
      const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".{0,5}");
      const regex = new RegExp(pattern, "i");

      return regex.test(cleanOCR);
    }

    const detected = martialArts.map(name => {
    const found = isWeaponDetected(name, weaponText1) || isWeaponDetected(name, weaponText2);
      return {
        original: name,
        found,
        name: translationMap[name] ?? name,
        raw: `${name}: **${found ? (translationMap[name] ?? name) : "❌"}**`
      };
    });


    const seen = new Set();

    const detectedList = detected
      .filter(w => w.found)
      .filter(w => {
        const normalized = w.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .map(w => `        • ${w.raw}`)
      .join("\n");


      console.log("Step 8");
      let scoreTextCleaned = scoreText;
      scoreTextCleaned = scoreTextCleaned
        .replace(/Goo0se/gi, "Goose")
        .replace(/Coose/gi, "Goose")
        .replace(/0oose/gi, "Goose")
        .replace(/Coo0se/gi, "Goose")
        .replace(/Gan5o/gi, "Goose")
        .replace(/Gans/gi, "Goose")
        .replace(/Oie/gi, "Goose")
        .replace(/Go0se/gi, "Goose");

      const scorePattern = /(\d+(?:\.\d+)?)\s*Goose/i;
      const scoreMatch = scoreTextCleaned.match(scorePattern);


      let gooseScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
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

      let role = "DPS";
      console.log("Step 9");
      if (
        hasWeapon(["Panacea Fan"]) &&
        hasWeapon(["Soulshade Umbrella"])
      ) {
        role = "Human Health Potion (Pure Healer)";
      } else if (
        hasWeapon(["Stormbreaker Spear"]) &&
        hasWeapon(["Thundercry Blade"])
      ) {
        role = "Aggro Sponge (Pure Tank)";
      } else if (
        hasWeapon(["Ninefold Umbrella"]) &&
        hasWeapon(["Inkwell Fan"])
      ) {
        role = "Snipes-From-Another-Map (Ranged DPS)";
      } else if (
        (hasWeapon(["Panacea Fan"]) || hasWeapon(["Soulshade Umbrella"])) &&
        (hasWeapon(["Stormbreaker Spear"]) || hasWeapon(["Thundercry Blade"]))
      ) {
        role = "Sir Not Dying Today (Tank + Healer)";
      } else if (
        hasWeapon(["Panacea Fan"]) ||
        hasWeapon(["Soulshade Umbrella"])
      ) {
        role = "Doctor Damage (Healer + DPS)";
      } else if (
        hasWeapon(["Stormbreaker Spear"]) ||
        hasWeapon(["Thundercry Blade"])
      ) {
        role = "Walking Raid Boss (Tank + DPS)";
      } else{
        role = "DPS";
      }

      const msg =
        `📝 **Detected Info**
        • **Role:** ${role}
        ${detectedList ? detectedList + "\n" : ""}
        • **Score (Goose):** ⭐ **${gooseScore}**`;


      console.log("Step 10");
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

      const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);

      await logChannel.send({
        content: `📸 **New Goose Upload**  
      **In-Game:** ${ingameName ?? "Unknown"}  
      **Role:** ${role}  
      **Score:** ⭐ ${gooseScore}
      📄 **OCR Text Detected (Score Region):**
      \`\`\`
      ${scoreText}
      \`\`\`
      📄 **OCR Text Detected (Weapons):**
      \`\`\`
      ${weaponText1}
      ${weaponText2}
      \`\`\`
      📄 **OCR Text Detected (ID Region):**
      \`\`\`
      ${idText}
      \`\`\``
      ,
        files: [interaction.options.getAttachment("image")]
      });

      await saveSkills(interaction.user.id, ingameName, playerId, role, detected, gooseScore);

    } catch (err) {
      console.error("OCR failed:", err);
      await interaction.editReply("❌ OCR failed.");
    }
  }
};

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
