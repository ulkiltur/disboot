import { SlashCommandBuilder } from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";


const dayChoices = [
  { name: "Monday", value: "Monday" },
  { name: "Tuesday", value: "Tuesday" },
  { name: "Wednesday", value: "Wednesday" },
  { name: "Thursday", value: "Thursday" },
  { name: "Friday", value: "Friday" },
  { name: "Saturday", value: "Saturday" },
  { name: "Sunday", value: "Sunday" }
];

const ALLOWED_USERS = [
  '1416909595955302431', // User 1 ID
  '320573579961958402', // User 2 ID
  '1439615858480775198'  // User 3 ID
];

export default {
  data: new SlashCommandBuilder()
    .setName("register_event")
    .setDescription("Register a scheduled event")
    .addStringOption(option =>
      option.setName("event_name")
        .setDescription("Name of the event")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("days")
        .setDescription("Select the days (comma-separated, e.g., Monday,Wednesday)")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("time")
        .setDescription("Time in format <t:unix:F>")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName("repeat_weekly")
        .setDescription("Does the event repeat every week?")
        .setRequired(true)
    ),

  async execute(interaction) {

    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not allowed to use /register_event.',
        flags: 64
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const eventName = interaction.options.getString("event_name");
    const daysInput = interaction.options.getString("days"); // e.g., "Monday,Wednesday"
    const timeInput = interaction.options.getString("time");   // <t:unix:F>
    const repeatWeekly = interaction.options.getBoolean("repeat_weekly");

    // Extract UNIX timestamp from <t:unix:F>
    const unixMatch = timeInput.match(/<t:(\d+):F>/);
    if (!unixMatch) {
      return interaction.editReply("❌ Invalid time format. Must be <t:unix:F>");
    }
    const unixTime = parseInt(unixMatch[1], 10);

    // Open DB
    const db = await open({
      filename: "./events.sqlite",
      driver: sqlite3.Database
    });

    // Create table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        days TEXT NOT NULL,
        time_unix INTEGER NOT NULL,
        repeat_weekly INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Save event
    await db.run(
      "INSERT INTO events (event_name, days, time_unix, repeat_weekly) VALUES (?, ?, ?, ?)",
      eventName,
      daysInput,
      unixTime,
      repeatWeekly ? 1 : 0
    );

    await db.close();

    await interaction.editReply(`✅ Event **${eventName}** registered for **${daysInput}** at <t:${unixTime}:F> ${repeatWeekly ? "(repeats weekly)" : ""}`);
  }
};
