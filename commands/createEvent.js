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
      option.setName("day1")
        .setDescription("Select day 1")
        .setRequired(true)
        .addChoices(...dayChoices)
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
    )
    .addStringOption(option =>
      option.setName("day2")
        .setDescription("Select day 2 (optional)")
        .setRequired(false)
        .addChoices(...dayChoices)
    )
    .addStringOption(option =>
      option.setName("day3")
        .setDescription("Select day 3 (optional)")
        .setRequired(false)
        .addChoices(...dayChoices)
    )
    .addStringOption(option =>
      option.setName("day4")
        .setDescription("Select day 4 (optional)")
        .setRequired(false)
        .addChoices(...dayChoices)
    )
    .addStringOption(option =>
      option.setName("day5")
        .setDescription("Select day 5 (optional)")
        .setRequired(false)
        .addChoices(...dayChoices)
    )
    .addStringOption(option =>
      option.setName("day6")
        .setDescription("Select day 6 (optional)")
        .setRequired(false)
        .addChoices(...dayChoices)
    )
    .addStringOption(option =>
      option.setName("day7")
        .setDescription("Select day 7 (optional)")
        .setRequired(false)
        .addChoices(...dayChoices)
    ),
    

  async execute(interaction) {

    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not allowed to use /register_event. Talk with a Warlord if you want to create an event',
        flags: 64
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const db = await open({
        filename: "/var/data/users.sqlite",
        driver: sqlite3.Database,
    });

    const eventName = interaction.options.getString("event_name");
    const daysInput = interaction.options.getString("days"); 
    const timeInput = interaction.options.getString("time");
    const repeatWeekly = interaction.options.getBoolean("repeat_weekly");

    // Extract UNIX timestamp from <t:unix:F>
    const unixMatch = timeInput.match(/<t:(\d+):t>/);
    if (!unixMatch) {
      return interaction.editReply("❌ Invalid time format. Must be <t:unix:t>");
    }
    const unixTime = parseInt(unixMatch[1], 10);

    // Save event
    await db.run(
      "INSERT INTO events (event_name, day, time_unix, repeats_weekly) VALUES (?, ?, ?, ?)",
      eventName,
      daysInput,
      unixTime,
      repeatWeekly ? 1 : 0
    );

    await interaction.editReply(`✅ Event **${eventName}** registered for **${daysInput}** at <t:${unixTime}:t> ${repeatWeekly ? "(repeats weekly)" : ""}`);
  }
};
