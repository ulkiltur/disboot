import sqlite from "sqlite3";
import { open } from "sqlite";

const CHANNEL_ID = "1452276743712014346";

const ROLE_ROTATION = [
  { key: "DPS", label: "DPS" },
  { key: "Aggro Sponge (Pure Tank)", label: "Aggro Sponge (Pure Tank)" },
  { key: "Human Health Potion (Pure Healer)", label: "Human Health Potion (Pure Healer)" },
  { key: "Walking Raid Boss (Tank + DPS)", label: "Walking Raid Boss (Tank + DPS)" },
  { key: "Doctor Damage (Healer + DPS)", label: "Doctor Damage (Healer + DPS)" },
  { key: "Sir Not Dying Today (Tank + Healer)", label: "Sir Not Dying Today (Tank + Healer)" },
  { key: "Snipes-From-Another-Map (Ranged DPS)", label: "Snipes-From-Another-Map (Ranged DPS)" },
  { key: "ALL", label: "All Roles" },
];

const ROTATE_EVERY_MS = 10_000;
const REFRESH_DATA_MS = 80_000;

export async function startLiveRanking(client) {
    console.log("startLiveRanking called");
  // -------------------------
  // INTERNAL STATE
  // -------------------------
  let rankingMessage = null;
  let cachedRankings = {};
  let roleIndex = 0;
  let lastDataRefresh = 0;
  let lastMessageContent = "";

  // -------------------------
  // DB (self managed)
  // -------------------------
  const db = await open({
    filename: "/var/data/users.sqlite",
    driver: sqlite.Database,
  });

  const channel = await client.channels.fetch(CHANNEL_ID);
  console.log("Channel fetched:", channel?.name, channel?.type);

  if (!channel.isTextBased()) {
    console.error("Channel is not text-based");
    return;
  }

  // -------------------------
  // Find or create message
  // -------------------------
  const messages = await channel.messages.fetch({ limit: 10 });
  console.log("Messages fetched:", messages.size);
  rankingMessage =
    messages.find(m => m.author.id === client.user.id) ??
    await channel.send("⏳ Initializing live rankings...");

    console.log("Using message ID:", msg.id);

  // -------------------------
  // Main loop
  // -------------------------
  setInterval(async () => {
    try {
      // Refresh cache
      if (Date.now() - lastDataRefresh > REFRESH_DATA_MS) {
        cachedRankings = await fetchAllRoleRankings(db);
        lastDataRefresh = Date.now();
      }

      const role = ROLE_ROTATION[roleIndex];
      const rows = cachedRankings[role.key] ?? [];

      const content = buildRankingMessage(role, rows, roleIndex);

      if (content !== lastMessageContent) {
        await rankingMessage.edit(content);
        lastMessageContent = content;
      }

      roleIndex = (roleIndex + 1) % ROLE_ROTATION.length;

    } catch (err) {
      console.error("Live ranking update failed:", err);
    }
  }, ROTATE_EVERY_MS);
}

async function fetchAllRoleRankings(db) {
  const result = {};

  for (const role of ROLE_ROTATION) {
    let query = `
      SELECT ingame_name, score
      FROM skills
    `;

    if (role.key !== "ALL") {
      query += ` WHERE role = ? `;
    }

    query += ` ORDER BY score DESC LIMIT 10`;

    const rows =
      role.key === "ALL"
        ? await db.all(query)
        : await db.all(query, role.label);

    result[role.key] = rows;
  }

  return result;
}

function buildRankingMessage(role, rows, roleIndex) {
  let text = `🏆 **Live Rankings — World Martial Masters**\n\n`;
  text += `🎭 **Role:** ${role.label} (${roleIndex + 1}/${ROLE_ROTATION.length})\n`;
  text += `⏱ Rotates every 10s · Full cycle ${ROLE_ROTATION.length * 10}s\n\n`;

  if (!rows.length) {
    text += "❌ No data available\n";
  } else {
    rows.forEach((r, i) => {
      const medal =
        i === 0 ? "🥇" :
        i === 1 ? "🥈" :
        i === 2 ? "🥉" :
        `#${i + 1}`;

      text += `${medal} **${r.ingame_name}** — ⭐ ${Number(r.score).toFixed(3)}\n`;
    });
  }

  text += `\n📅 Last update: <t:${Math.floor(Date.now() / 1000)}:R>`;
  return text;
}
