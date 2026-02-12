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

// Count members with the on-duty role
function getOnDutyCount(guild) {
  const role = guild.roles.cache.find((r) => r.name === ON_DUTY_ROLE);
  return role ? role.members.size : 0;
}

// Build the duty embed (with live count)
function buildDutyEmbed(guild) {
  const activeCount = getOnDutyCount(guild);
  return {
    title: "🟣 Phoenix Squadron — Duty Status",
    description:
      "**Response Protocol Active**\n\n" +
      `🩺 **Phoenix On Duty Active:** **${activeCount}**\n\n` +
      "Toggle your availability for QRF medical response.\n\n" +
      "• On Duty → You will be pinged for rescues\n" +
      "• Off Duty → No notifications",
    color: 0x6a0dad,
    footer: { text: "Phoenix Response System" },
  };
}

// Build the rescue embed
function buildRescueEmbed() {
  return {
    title: "🚨 Request Extraction / Medical Support",
    description:
      "Press below to open a **private rescue ticket**.\n\n" +
      "**Include:**\n" +
      "• Location\n" +
      "• Situation\n" +
      "• Enemy presence\n" +
      "• Urgency",
    color: 0x6a0dad,
    footer: { text: "Phoenix Response System" },
  };
}

// Update the duty panel message (edits existing panel)
async function refreshDutyPanel() {
  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const dutyPanelId = process.env.ON_DUTY_PANEL_ID;
  if (!onDutyChannelId || !dutyPanelId) return;

  const ch = await client.channels.fetch(onDutyChannelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const msg = await ch.messages.fetch(dutyPanelId).catch(() => null);
  if (!msg) return;

  const dutyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("toggle_duty")
      .setLabel("Toggle On/Off Duty")
      .setStyle(ButtonStyle.Secondary)
  );

  await msg.edit({ embeds: [buildDutyEmbed(ch.guild)], components: [dutyRow] }).catch(() => {});
}

client.once("ready", async () => {
  console.log(`🟣 Phoenix Squadron Bot Online as ${client.user.tag}`);

  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const rescueChannelId = process.env.RESCUE_CHANNEL_ID;
  const dutyPanelId = process.env.ON_DUTY_PANEL_ID;
  const rescuePanelId = process.env.RESCUE_PANEL_ID;

  if (!onDutyChannelId || !rescueChannelId || !dutyPanelId || !rescuePanelId) {
    console.log("❌ Missing one or more env vars: ON_DUTY_CHANNEL_ID, RESCUE_CHANNEL_ID, ON_DUTY_PANEL_ID, RESCUE_PANEL_ID");
    return;
  }

  const onDutyChannel = await client.channels.fetch(onDutyChannelId).catch(() => null);
  const rescueChannel = await client.channels.fetch(rescueChannelId).catch(() => null);

  if (!onDutyChannel || !onDutyChannel.isTextBased()) {
    console.log("❌ Could not access ON_DUTY_CHANNEL_ID (wrong ID or missing access).");
    return;
  }

  if (!rescueChannel || !rescueChannel.isTextBased()) {
    console.log("❌ Could not access RESCUE_CHANNEL_ID (wrong ID or missing access).");
    return;
  }

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

  // Update existing panels (no duplicates)
  const dutyMsg = await onDutyChannel.messages.fetch(dutyPanelId).catch(() => null);
  if (dutyMsg) {
    await dutyMsg.edit({ embeds: [buildDutyEmbed(onDutyChannel.guild)], components: [dutyRow] });
    console.log("✅ Updated existing On Duty panel.");
  } else {
    console.log("❌ Could not fetch On Duty panel message (wrong ON_DUTY_PANEL_ID or missing access).");
  }

  const rescueMsg = await rescueChannel.messages.fetch(rescuePanelId).catch(() => null);
  if (rescueMsg) {
    await rescueMsg.edit({ embeds: [buildRescueEmbed()], components: [rescueRow] });
    console.log("✅ Updated existing Rescue panel.");
  } else {
    console.log("❌ Could not fetch Rescue panel message (wrong RESCUE_PANEL_ID or missing access).");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const guild = interaction.guild;
  const member = interaction.member;
  const role = guild.roles.cache.find((r) => r.name === ON_DUTY_ROLE);

  // TOGGLE DUTY
  if (interaction.customId === "toggle_duty") {
    if (!role) {
      return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });
    }

    try {
      // Toggle
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
      } else {
        await member.roles.add(role);
      }

      // Refresh panel counter
      await refreshDutyPanel();

      // Reply
      const isOnDutyNow = member.roles.cache.has(role.id);
      return interaction.reply({
        content: isOnDutyNow ? "🟣 You are now **ON Duty**." : "🟣 You are now **OFF Duty**.",
        ephemeral: true,
      });
    } catch (e) {
      console.error("❌ Failed to toggle duty:", e);
      return interaction.reply({
        content: "❌ I couldn't change your role. Check role hierarchy and Manage Roles permission.",
        ephemeral: true,
      });
    }
  }

  // REQUEST RESCUE
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
// ✅ Force bot access even if category perms are weird
await channel.permissionOverwrites.edit(guild.members.me.id, {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_rescue").setLabel("🔒 Claim Rescue").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_rescue").setLabel("✅ Close Ticket").setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `🚨 <@&${role.id}> Rescue request from <@${interaction.user.id}>`,
        components: [row],
      });

      return interaction.reply({ content: `🚑 Rescue channel created: ${channel}`, ephemeral: true });
    } catch (e) {
      console.error("❌ Failed to create rescue channel:", e);
      return interaction.reply({
        content: "❌ I couldn't create the rescue channel. Check Manage Channels permission and category permissions.",
        ephemeral: true,
      });
    }
  }

  // CLAIM
  if (interaction.customId === "claim_rescue") {
    return interaction.reply({ content: `🔒 Rescue claimed by <@${interaction.user.id}>` });
  }

  // CLOSE
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
