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

// ---------- Helpers ----------
function getOnDutyCount(guild) {
  const role = guild.roles.cache.find((r) => r.name === ON_DUTY_ROLE);
  return role ? role.members.size : 0;
}

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


function buildRescueEmbed() {
  return {
    title: "🚨 Request Extraction / Medical Support",
    description:
      "Press below to open a **private rescue ticket**.\n\n" +
      "**Include:**\n" +
      "• Location\n" +
      "• Situation / injuries\n" +
      "• Enemy presence\n" +
      "• Urgency",
    color: 0x6a0dad,
    footer: { text: "Phoenix Response System" },
  };
}

async function logEvent(guild, text) {
  const logId = process.env.LOG_CHANNEL_ID;
  if (!logId) return;

  const ch = await client.channels.fetch(logId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  await ch.send(text).catch(() => {});
}

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

// ---------- Startup: update panels (no duplicates) ----------
client.once("ready", async () => {
  console.log(`🟣 Phoenix Squadron Bot Online as ${client.user.tag}`);

  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const rescueChannelId = process.env.RESCUE_CHANNEL_ID;
  const dutyPanelId = process.env.ON_DUTY_PANEL_ID;
  const rescuePanelId = process.env.RESCUE_PANEL_ID;

  if (!onDutyChannelId || !rescueChannelId || !dutyPanelId || !rescuePanelId) {
    console.log(
      "❌ Missing env vars. Required: ON_DUTY_CHANNEL_ID, RESCUE_CHANNEL_ID, ON_DUTY_PANEL_ID, RESCUE_PANEL_ID"
    );
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

  const dutyMsg = await onDutyChannel.messages.fetch(dutyPanelId).catch(() => null);
  if (dutyMsg) {
    await dutyMsg.edit({ embeds: [buildDutyEmbed(onDutyChannel.guild)], components: [dutyRow] });
    console.log("✅ Updated existing On Duty panel.");
  } else {
    console.log("❌ Could not fetch On Duty panel message (check ON_DUTY_PANEL_ID).");
  }

  const rescueMsg = await rescueChannel.messages.fetch(rescuePanelId).catch(() => null);
  if (rescueMsg) {
    await rescueMsg.edit({ embeds: [buildRescueEmbed()], components: [rescueRow] });
    console.log("✅ Updated existing Rescue panel.");
  } else {
    console.log("❌ Could not fetch Rescue panel message (check RESCUE_PANEL_ID).");
  }
});

// ---------- Buttons ----------
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
      const wasOnDuty = member.roles.cache.has(role.id);

      if (wasOnDuty) {
        await member.roles.remove(role);
      } else {
        await member.roles.add(role);
      }

      await refreshDutyPanel();

      return interaction.reply({
        content: wasOnDuty ? "🟣 You are now **OFF Duty**." : "🟣 You are now **ON Duty**.",
        ephemeral: true,
      });
    } catch (e) {
      console.error("❌ Failed to toggle duty:", e);
      return interaction.reply({
        content: "❌ I couldn't change your role. Check role hierarchy + Manage Roles permission.",
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
      // ✅ One-ticket-per-user check (by topic)
      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Rescue ticket for ${interaction.user.id}`
      );

      if (existing) {
        return interaction.reply({
          content: `⚠️ You already have an active rescue ticket: ${existing}`,
          ephemeral: true,
        });
      }

      const channelName = `rescue-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 90);

      const channel = await guild.channels.create({
        name: channelName,
        parent: process.env.TICKET_CATEGORY_ID,
        type: 0, // GuildText
        topic: `Rescue ticket for ${interaction.user.id}`,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },

          // ✅ Allow the bot
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },

          // Allow requester
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },

          // Allow on-duty role
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

      // ✅ Extra safety against category perms
      await channel.permissionOverwrites.edit(guild.members.me.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
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

      const activeMedics = getOnDutyCount(guild);

if (activeMedics > 0) {
  await channel.send({
    content: `🚨 <@&${role.id}> Rescue request from <@${interaction.user.id}>`,
    components: [row],
  });
} else {
  await channel.send({
    content:
      `🚨 Rescue request from <@${interaction.user.id}>\n\n` +
      `⚠️ **No Phoenix medics are currently On Duty.**\n` +
      `Your ticket is open, but response may be delayed.`,
    components: [row],
  });

  await logEvent(
    guild,
    `⚠️ **No Medics Available** — Rescue opened by <@${interaction.user.id}>`
  );
}

  }

  // CLAIM
  if (interaction.customId === "claim_rescue") {
    await logEvent(
      interaction.guild,
      `🔒 **Rescue Claimed** — <@${interaction.user.id}> claimed ${interaction.channel}`
    );
    return interaction.reply({ content: `🔒 Rescue claimed by <@${interaction.user.id}>` });
  }

  // CLOSE
  if (interaction.customId === "close_rescue") {
    await logEvent(
      interaction.guild,
      `✅ **Rescue Closed** — <@${interaction.user.id}> closed ${interaction.channel}`
    );
    await interaction.reply({ content: "Closing ticket in 5 seconds..." });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

// ---------- Login ----------
const token = process.env.TOKEN;
if (!token || token.trim().length < 20) {
  console.error("❌ TOKEN env var missing or looks wrong. Set Railway Variable TOKEN and redeploy.");
  process.exit(1);
}

client.login(token).catch((e) => {
  console.error("❌ Login failed:", e);
  process.exit(1);
});
