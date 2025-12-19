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
  '1416909595955302431',
  '320573579961958402',
  '1439615858480775198'
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
      option.setName("time")
        .setDescription("Time in format <t:UNIX:t>")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName("repeat_weekly")
        .setDescription("Does the event repeat every week?")
        .setRequired(true)
    )
    .addStringOption(option => option.setName("day1").setDescription("Day 1").setRequired(true).addChoices(...dayChoices))
    .addStringOption(option => option.setName("day2").setDescription("Day 2").setRequired(false).addChoices(...dayChoices))
    .addStringOption(option => option.setName("day3").setDescription("Day 3").setRequired(false).addChoices(...dayChoices))
    .addStringOption(option => option.setName("day4").setDescription("Day 4").setRequired(false).addChoices(...dayChoices))
    .addStringOption(option => option.setName("day5").setDescription("Day 5").setRequired(false).addChoices(...dayChoices))
    .addStringOption(option => option.setName("day6").setDescription("Day 6").setRequired(false).addChoices(...dayChoices))
    .addStringOption(option => option.setName("day7").setDescription("Day 7").setRequired(false).addChoices(...dayChoices)),

  async execute(interaction) {
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not allowed to use /register_event. Talk with a Warlord if you want to create an event',
        flags: 64 // ephemeral
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const db = await open({
      filename: "/var/data/users.sqlite",
      driver: sqlite3.Database,
    });

    const eventName = interaction.options.getString("event_name");
    const repeatWeekly = interaction.options.getBoolean("repeat_weekly");
    const timeInput = interaction.options.getString("time");

    // ✅ Extract UNIX timestamp from <t:UNIX:t>
    const unixMatch = timeInput.match(/<t:(\d+):t>/);
    if (!unixMatch) {
      return interaction.editReply("❌ Invalid time format. Must be <t:UNIX:t>");
    }
    const unixTime = parseInt(unixMatch[1], 10);

    // Convert to Date
    const date = new Date(unixTime * 1000);
    const eventHour = date.getHours();     // 0–23
    const eventMinute = date.getMinutes(); // 0–59

    // Collect days
    const days = [];
    for (let i = 1; i <= 7; i++) {
      const dayOption = interaction.options.getString(`day${i}`);
      if (dayOption) days.push(dayOption);
    }

    if (days.length === 0) {
      return interaction.editReply("❌ You must select at least one day.");
    }

    // Insert one row per day
    for (const day of days) {
      await db.run(
        "INSERT INTO events (event_name, day, event_hour, event_minute, repeats_weekly) VALUES (?, ?, ?, ?, ?)",
        eventName,
        day,
        eventHour,
        eventMinute,
        repeatWeekly ? 1 : 0
      );
    }

    await interaction.editReply(`✅ Event **${eventName}** registered for **${days.join(", ")}** at ${timeInput} ${repeatWeekly ? "(repeats weekly)" : ""}`);
  }
};
