process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const ON_DUTY_ROLE = "Phoenix On Duty";

const RESCUE_MODAL_ID = "rescue_request_modal";
const RESCUE_REPORT_MODAL_ID = "rescue_report_modal";

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
      "You’ll be prompted for:\n" +
      "• In-game name (IGN)\n" +
      "• System\n" +
      "• Planet / Moon / POI\n" +
      "• Hostiles\n" +
      "• Notes",
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

function buildRescueModal() {
  const modal = new ModalBuilder().setCustomId(RESCUE_MODAL_ID).setTitle("Phoenix Rescue Request");

  const ignInput = new TextInputBuilder()
    .setCustomId("ign")
    .setLabel("In-game name (IGN)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., MikeOrtiz")
    .setRequired(true);

  const systemInput = new TextInputBuilder()
    .setCustomId("system")
    .setLabel("System")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Stanton, Pyro")
    .setRequired(true);

  const planetInput = new TextInputBuilder()
    .setCustomId("planet")
    .setLabel("Planet / Moon / POI")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Hurston, Daymar, Ruin Station")
    .setRequired(true);

  const hostilesInput = new TextInputBuilder()
    .setCustomId("hostiles")
    .setLabel("Hostiles")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("None / Light / Heavy (type & count if known)")
    .setRequired(true);

  const notesInput = new TextInputBuilder()
    .setCustomId("notes")
    .setLabel("Extra details (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Injuries, ship status, marker, comms, preferred pickup, etc.")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ignInput),
    new ActionRowBuilder().addComponents(systemInput),
    new ActionRowBuilder().addComponents(planetInput),
    new ActionRowBuilder().addComponents(hostilesInput),
    new ActionRowBuilder().addComponents(notesInput)
  );

  return modal;
}

function buildRescueReportModal() {
  const modal = new ModalBuilder().setCustomId(RESCUE_REPORT_MODAL_ID).setTitle("Phoenix Rescue Report");

  const outcome = new TextInputBuilder()
    .setCustomId("outcome")
    .setLabel("Outcome")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Successful / Partial / Failed")
    .setRequired(true);

  const summary = new TextInputBuilder()
    .setCustomId("summary")
    .setLabel("Summary")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("What happened? What actions were taken?")
    .setRequired(true);

  const threats = new TextInputBuilder()
    .setCustomId("threats")
    .setLabel("Hostiles / Threats (optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("None / Light / Heavy (details)")
    .setRequired(false);

  const lessons = new TextInputBuilder()
    .setCustomId("lessons")
    .setLabel("Notes / Lessons learned (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Anything to improve for next time?")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(outcome),
    new ActionRowBuilder().addComponents(summary),
    new ActionRowBuilder().addComponents(threats),
    new ActionRowBuilder().addComponents(lessons)
  );

  return modal;
}

function parseTicketInfo(channel) {
  const topic = channel?.topic || "";
  const requesterMatch = topic.match(/Rescue ticket for (\d+)/);
  const claimedMatch = topic.match(/CLAIMED_BY:(\d+)/);
  return {
    requesterId: requesterMatch ? requesterMatch[1] : null,
    claimedById: claimedMatch ? claimedMatch[1] : null,
  };
}

// ---------- Startup: update panels (no duplicates) ----------
client.once("ready", async () => {
  console.log(`🟣 Phoenix Squadron Bot Online as ${client.user.tag}`);

  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const rescueChannelId = process.env.RESCUE_CHANNEL_ID;
  const dutyPanelId = process.env.ON_DUTY_PANEL_ID;
  const rescuePanelId = process.env.RESCUE_PANEL_ID;

  if (!onDutyChannelId || !rescueChannelId || !dutyPanelId || !rescuePanelId) {
    console.log("❌ Missing env vars: ON_DUTY_CHANNEL_ID, RESCUE_CHANNEL_ID, ON_DUTY_PANEL_ID, RESCUE_PANEL_ID");
    return;
  }

  const onDutyChannel = await client.channels.fetch(onDutyChannelId).catch(() => null);
  const rescueChannel = await client.channels.fetch(rescueChannelId).catch(() => null);

  if (!onDutyChannel || !onDutyChannel.isTextBased()) {
    console.log("❌ Could not access ON_DUTY_CHANNEL_ID.");
    return;
  }
  if (!rescueChannel || !rescueChannel.isTextBased()) {
    console.log("❌ Could not access RESCUE_CHANNEL_ID.");
    return;
  }

  const dutyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("toggle_duty").setLabel("Toggle On/Off Duty").setStyle(ButtonStyle.Secondary)
  );

  const rescueRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("request_rescue").setLabel("Request Extraction").setStyle(ButtonStyle.Danger)
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

// ---------- Interactions ----------
client.on("interactionCreate", async (interaction) => {
  // BUTTONS
  if (interaction.isButton()) {
    const guild = interaction.guild;
    const member = interaction.member;
    const role = guild.roles.cache.find((r) => r.name === ON_DUTY_ROLE);

    // TOGGLE DUTY
    if (interaction.customId === "toggle_duty") {
      if (!role) return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });

      try {
        const wasOnDuty = member.roles.cache.has(role.id);
        if (wasOnDuty) await member.roles.remove(role);
        else await member.roles.add(role);

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

    // REQUEST RESCUE -> SHOW MODAL
    if (interaction.customId === "request_rescue") {
      if (!role) return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });

      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Rescue ticket for ${interaction.user.id}`
      );
      if (existing) {
        return interaction.reply({
          content: `⚠️ You already have an active rescue ticket: ${existing}`,
          ephemeral: true,
        });
      }

      return interaction.showModal(buildRescueModal());
    }

    // CLAIM (Assigned Medic + lock)
    if (interaction.customId === "claim_rescue") {
      const channel = interaction.channel;

      if (channel.topic && channel.topic.includes("CLAIMED_BY:")) {
        return interaction.reply({ content: "⚠️ This rescue has already been claimed.", ephemeral: true });
      }

      const baseTopic = channel.topic || "";
      const newTopic = `${baseTopic} | CLAIMED_BY:${interaction.user.id}`.slice(0, 1024);
      await channel.setTopic(newTopic).catch(() => {});

      const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
      if (messages) {
        const oldest = messages.last();
        if (oldest) {
          const alreadyHasAssigned = oldest.content.includes("Assigned Medic:");
          const updatedContent = alreadyHasAssigned
            ? oldest.content
            : `${oldest.content}\n\n🩺 **Assigned Medic:** <@${interaction.user.id}>`;
          await oldest.edit({ content: updatedContent, components: oldest.components }).catch(() => {});
        }
      }

      await logEvent(interaction.guild, `🔒 **Rescue Claimed** — <@${interaction.user.id}> claimed ${channel}`);
      return interaction.reply({ content: "🔒 You have claimed this rescue.", ephemeral: true });
    }

    // CLOSE -> OPEN REPORT MODAL
    if (interaction.customId === "close_rescue") {
      return interaction.showModal(buildRescueReportModal());
    }

    return;
  }

  // RESCUE REQUEST MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === RESCUE_MODAL_ID) {
    const guild = interaction.guild;
    const role = guild.roles.cache.find((r) => r.name === ON_DUTY_ROLE);

    if (!role) return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });

    try {
      await interaction.deferReply({ ephemeral: true });

      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Rescue ticket for ${interaction.user.id}`
      );
      if (existing) {
        return interaction.editReply(`⚠️ You already have an active rescue ticket: ${existing}`);
      }

      const ign = interaction.fields.getTextInputValue("ign");
      const system = interaction.fields.getTextInputValue("system");
      const planet = interaction.fields.getTextInputValue("planet");
      const hostiles = interaction.fields.getTextInputValue("hostiles");
      const notes = interaction.fields.getTextInputValue("notes") || "—";

      const channelName = `rescue-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 90);

      const channel = await guild.channels.create({
        name: channelName,
        parent: process.env.TICKET_CATEGORY_ID || null,
        type: 0,
        topic: `Rescue ticket for ${interaction.user.id}`,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
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

      // safety vs category perms
      await channel.permissionOverwrites.edit(guild.members.me.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_rescue").setLabel("🔒 Claim Rescue").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_rescue").setLabel("✅ Close Ticket").setStyle(ButtonStyle.Danger)
      );

      const details =
        `🎮 **IGN:** ${ign}\n` +
        `📍 **System:** ${system}\n` +
        `🪐 **Planet/POI:** ${planet}\n` +
        `⚔️ **Hostiles:** ${hostiles}\n` +
        `📝 **Notes:** ${notes}`;

      const activeMedics = getOnDutyCount(guild);

      if (activeMedics > 0) {
        await channel.send({
          content: `🚨 <@&${role.id}> Rescue request from <@${interaction.user.id}>\n\n${details}`,
          components: [row],
        });
      } else {
        await channel.send({
          content:
            `🚨 Rescue request from <@${interaction.user.id}>\n\n` +
            `⚠️ **No Phoenix medics are currently On Duty.** Response may be delayed.\n\n` +
            `${details}`,
          components: [row],
        });
        await logEvent(guild, `⚠️ **No Medics Available** — Rescue opened by <@${interaction.user.id}>`);
      }

      await logEvent(guild, `🆕 **Rescue Opened** — <@${interaction.user.id}> in ${channel}`);
      return interaction.editReply(`🚑 Rescue channel created: ${channel}`);
    } catch (e) {
      console.error("❌ Rescue request modal submit failed:", e);
      if (!interaction.replied) {
        return interaction.reply({ content: "❌ Failed to create ticket. Check logs.", ephemeral: true });
      }
    }
  }

  // RESCUE REPORT MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === RESCUE_REPORT_MODAL_ID) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;
      const guild = interaction.guild;

      const { requesterId, claimedById } = parseTicketInfo(channel);

      const outcome = interaction.fields.getTextInputValue("outcome");
      const summary = interaction.fields.getTextInputValue("summary");
      const threats = interaction.fields.getTextInputValue("threats") || "—";
      const lessons = interaction.fields.getTextInputValue("lessons") || "—";

      const requesterTag = requesterId ? `<@${requesterId}>` : "Unknown";
      const assignedTag = claimedById ? `<@${claimedById}>` : "Unassigned";

      await logEvent(
        guild,
        `📝 **Rescue Report Submitted**\n` +
          `• **Ticket:** ${channel}\n` +
          `• **Requester:** ${requesterTag}\n` +
          `• **Assigned Medic:** ${assignedTag}\n` +
          `• **Submitted By:** <@${interaction.user.id}>\n` +
          `• **Outcome:** ${outcome}\n` +
          `• **Threats:** ${threats}\n` +
          `• **Summary:** ${summary}\n` +
          `• **Notes:** ${lessons}`
      );

      await interaction.editReply("✅ Report submitted. Closing ticket in 5 seconds...");
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    } catch (e) {
      console.error("❌ Rescue report modal submit failed:", e);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: "❌ Report failed to submit. Check logs.", ephemeral: true });
      }
      return interaction.editReply("❌ Report failed to submit. Check logs.");
    }
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
