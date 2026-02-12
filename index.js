process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const ON_DUTY_ROLE = "Phoenix On Duty";
function getOnDutyCount(guild) {
  const role = guild.roles.cache.find(r => r.name === ON_DUTY_ROLE);
  return role ? role.members.size : 0;
}

client.once("ready", async () => {
  console.log(`🟣 Phoenix Squadron Bot Online as ${client.user.tag}`);

  const onDutyChannel = await client.channels.fetch(process.env.ON_DUTY_CHANNEL_ID);
  const rescueChannel = await client.channels.fetch(process.env.RESCUE_CHANNEL_ID);

  const dutyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("toggle_duty")
      .setLabel("Toggle On/Off Duty")
      .setStyle(ButtonStyle.Secondary)
  );

  const rescueRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("request_rescue")
      .setLabel("Request Extraction")
      .setStyle(ButtonStyle.Danger)
  );

const activeCount = getOnDutyCount(onDutyChannel.guild);

const dutyEmbed = {
  title: "🟣 Phoenix Squadron — Duty Status",
  description:
    "**Response Protocol Active**\n\n" +
    `🩺 **Phoenix On Duty Active:** **${activeCount}**\n\n` +
    "Toggle your availability for QRF medical response.\n\n" +
    "• On Duty → You will be pinged for rescues\n" +
    "• Off Duty → No notifications",
  color: 0x6a0dad,
  footer: { text: "Phoenix Response System" }
};


  const rescueEmbed = {
    title: "🚨 Request Extraction / Medical Support",
    description:
      "Press below to open a **private rescue ticket**.\n\n" +
      "Include:\n" +
      "• Location\n" +
      "• Situation\n" +
      "• Enemy presence\n" +
      "• Urgency",
    color: 0x6a0dad,
    footer: { text: "Phoenix Response System" }
  };

  const dutyMessage = await onDutyChannel.messages
    .fetch(process.env.ON_DUTY_PANEL_ID)
    .catch(() => null);

  if (dutyMessage) {
    await dutyMessage.edit({ embeds: [dutyEmbed], components: [dutyRow] });
  }

  const rescueMessage = await rescueChannel.messages
    .fetch(process.env.RESCUE_PANEL_ID)
    .catch(() => null);

  if (rescueMessage) {
    await rescueMessage.edit({ embeds: [rescueEmbed], components: [rescueRow] });
  }

  console.log("🟣 Panels updated with purple embed styling.");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const guild = interaction.guild;
  const member = interaction.member;

  const role = guild.roles.cache.find((r) => r.name === ON_DUTY_ROLE);

  // Toggle Duty
  if (interaction.customId === "toggle_duty") {
    if (!role) {
      return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });
    }

    try {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        return interaction.reply({ content: "🟣 You are now **OFF Duty**.", ephemeral: true });
      } else {
        await member.roles.add(role);
        return interaction.reply({ content: "🟣 You are now **ON Duty**.", ephemeral: true });
      }
    } catch (e) {
      console.error("❌ Failed to toggle role:", e);
      return interaction.reply({
        content: "❌ I couldn't change your role. Check role hierarchy and bot permissions.",
        ephemeral: true,
      });
    }
  }

  // Request Rescue Ticket (Private Channel)
  if (interaction.customId === "request_rescue") {
    if (!role) {
      return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });
    }

    try {
      const channelName = `rescue-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 90);

      const channel = await guild.channels.create({
        name: channelName,
        type: 0, // GuildText
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
          {
            id: role.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_rescue")
          .setLabel("🔒 Claim Rescue")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("close_rescue")
          .setLabel("✅ Close Ticket")
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `🚨 <@&${role.id}> Rescue request from <@${interaction.user.id}>`,
        components: [row],
      });

      return interaction.reply({ content: `🚑 Rescue channel created: ${channel}`, ephemeral: true });
    } catch (e) {
      console.error("❌ Failed to create rescue channel:", e);
      return interaction.reply({
        content: "❌ I couldn't create the rescue channel. Check Manage Channels permission.",
        ephemeral: true,
      });
    }
  }

  // Claim Rescue
  if (interaction.customId === "claim_rescue") {
    return interaction.reply({ content: `🔒 Rescue claimed by <@${interaction.user.id}>` });
  }

  // Close Ticket
  if (interaction.customId === "close_rescue") {
    await interaction.reply({ content: "Closing ticket in 5 seconds..." });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

const token = process.env.TOKEN;
if (!token || token.trim().length < 20) {
  console.error("❌ TOKEN env var missing or looks wrong. Set Railway Variable TOKEN and redeploy.");
  process.exit(1);
}

client.login(token).catch((e) => {
  console.error("❌ Login failed:", e);
  process.exit(1);
});
