import { SlashCommandBuilder } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { martialArts } from "../data/weapons.js";
import { translationMap } from "../data/translationMap.js";
import dns from "node:dns";
import { Agent, fetch } from "undici";
export const fullData = { text: null, discordId: null };


const sqlite = sqlite3.verbose();

const server = process.env.server;

const ipv4Agent = new Agent({
  connect: {
    family: 4
  }
});



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

    await interaction.deferReply({ flags: 64 });

    console.log("DNS result order:", dns.getDefaultResultOrder());

    const image = interaction.options.getAttachment("image");

    if (!image?.contentType?.startsWith("image/")) {
      return interaction.reply({ content: "❌ Upload a valid image file.", flags: 64 });
    }

    const response = await fetch(image.url);
    const buffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(buffer);
    
    await sendToOcrServer(imageBuffer, interaction.discordId.id);
    await interaction.editReply(`✅ Results will arrive shortly.`);

    let timer = 0;
    const maxTime = 420; // 420 seconds = 7 minutes

    // Wait until OCR server fills fullData.text
    while ((!fullData.text || fullData.discordId !== interaction.user.id) && timer < maxTime) {
      await new Promise(r => setTimeout(r, 1000));
      timer++;
    }

    if (!fullData.text || fullData.discordId !== interaction.user.id) {
      return interaction.editReply("❌ OCR timed out.");
    }

    const fullText = fullData.text ?? "";

    fullData.text = null;
    fullData.discordId = null;

    // reuse your existing logic
    let scoreText = fullText;
    let weaponText1 = fullText;
    let weaponText2 = fullText;
    let idText = fullText;

    const playerIdMatch = idText.match(/\b\d{8,}\b/);
    const playerId = playerIdMatch ? playerIdMatch[0] : null;




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
      scoreText = scoreText
        .replace(/Goo0se/gi, "Goose")
        .replace(/Coose/gi, "Goose")
        .replace(/0oose/gi, "Goose")
        .replace(/Coo0se/gi, "Goose")
        .replace(/Gan5o/gi, "Goose")
        .replace(/Gans/gi, "Goose")
        .replace(/Oie/gi, "Goose")
        .replace(/Go0se/gi, "Goose")
        .replace(/G0ose/gi, "Goose");

      const scorePattern = /(\d+(?:\.\d+)?)\s*Goose/i;
      const scoreMatch = scoreText.match(scorePattern);

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

async function safeReadJson(res, label = "response") {
  const raw = await res.text(); // read body ONCE

  try {
    return JSON.parse(raw);
  } catch {
    console.error(`Invalid JSON from ${label}:`, raw);
    throw new Error(`${label} returned invalid JSON`);
  }
}


async function sendToOcrServer(buffer, discordId) {
  const b64 = buffer.toString("base64");

  const submitRes = await fetch(`${server}/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
       image: b64,
       discordId
    }),
    dispatcher: ipv4Agent, // force IPv4
  });

  const submitData = await safeReadJson(submitRes, "/ocr");

  if (!submitRes.ok) {
    throw new Error(submitData.error || "Failed to submit OCR job");
  }

  // Just return the job ID and stop
  return { jobId: submitData.job_id };
}



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
