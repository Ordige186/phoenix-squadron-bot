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

// Roles
const ON_DUTY_ROLE = "Phoenix On Duty";
const RECON_ROLE = "Phoenix Recon";

// Modal IDs
const RESCUE_MODAL_ID = "rescue_request_modal";
const RESCUE_REPORT_MODAL_ID = "rescue_report_modal";
const RECON_MODAL_ID = "recon_request_modal";
const RECON_REPORT_MODAL_ID = "recon_report_modal";

// ---------- Helpers ----------
function getRoleByName(guild, roleName) {
  return guild.roles.cache.find((r) => r.name === roleName) || null;
}

function getRoleCount(guild, roleName) {
  const role = getRoleByName(guild, roleName);
  return role ? role.members.size : 0;
}

function getOnDutyCount(guild) {
  return getRoleCount(guild, ON_DUTY_ROLE);
}

function buildDutyEmbed(guild) {
  const activeCount = getOnDutyCount(guild);
  return {
    title: "🟣 Phoenix Squadron — Duty Status",
    description:
      "**Response Protocol Active**\n\n" +
      `🩺 **Phoenix On Duty Active:** **${activeCount}**\n\n` +
      "Use the buttons below to set your response status.\n\n" +
      "• On Duty → You will be pinged for rescues\n" +
      "• Off Duty → No notifications",
    color: 0x6a0dad,
    footer: { text: "Phoenix Response System" },
  };
}

function buildOpsEmbed() {
  return {
    title: "🚨 Phoenix Requests — Extraction & Recon",
    description:
      "Use the buttons below to open a **private ticket**.\n\n" +
      "**Extraction / Medical**:\n" +
      "• Name • System • Planet/POI • Hostiles • Notes\n\n" +
      "**Recon**:\n" +
      "• Name • System • Location/POI • Objective",
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

function dutyButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("go_on_duty")
      .setLabel("🟢 Go On Duty")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("go_off_duty")
      .setLabel("🔴 Go Off Duty")
      .setStyle(ButtonStyle.Danger)
  );
}

async function refreshDutyPanel() {
  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const dutyPanelId = process.env.ON_DUTY_PANEL_ID;
  if (!onDutyChannelId || !dutyPanelId) return;

  const ch = await client.channels.fetch(onDutyChannelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const msg = await ch.messages.fetch(dutyPanelId).catch(() => null);
  if (!msg) return;

  await msg.edit({ embeds: [buildDutyEmbed(ch.guild)], components: [dutyButtonsRow()] }).catch(() => {});
}

function opsButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("request_rescue")
      .setLabel("Request Extraction")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("request_recon")
      .setLabel("Request Recon")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildRescueModal() {
  const modal = new ModalBuilder().setCustomId(RESCUE_MODAL_ID).setTitle("Phoenix Rescue Request");

  const name = new TextInputBuilder()
    .setCustomId("Name")
    .setLabel("In-game name (Name)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Bob")
    .setRequired(true);

  const system = new TextInputBuilder()
    .setCustomId("system")
    .setLabel("System")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Nyx, Pyro, Stanton")
    .setRequired(true);

  const planet = new TextInputBuilder()
    .setCustomId("planet")
    .setLabel("Planet / Moon / POI")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Hurston, Daymar, Ruin Station")
    .setRequired(true);

  const hostiles = new TextInputBuilder()
    .setCustomId("hostiles")
    .setLabel("Hostiles")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("None / Light / Heavy (type & count if known)")
    .setRequired(true);

  const notes = new TextInputBuilder()
    .setCustomId("notes")
    .setLabel("Extra details (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Injuries, ship status, marker, comms, preferred pickup, etc.")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ign),
    new ActionRowBuilder().addComponents(system),
    new ActionRowBuilder().addComponents(planet),
    new ActionRowBuilder().addComponents(hostiles),
    new ActionRowBuilder().addComponents(notes)
  );

  return modal;
}

function buildReconModal() {
  const modal = new ModalBuilder().setCustomId(RECON_MODAL_ID).setTitle("Phoenix Recon Request");

  const name = new TextInputBuilder()
    .setCustomId("Name")
    .setLabel("Name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Bob Rogers)
    .setRequired(true);

  const system = new TextInputBuilder()
    .setCustomId("system")
    .setLabel("System")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Nyx, Pyro, Stanton")
    .setRequired(true);

  const location = new TextInputBuilder()
    .setCustomId("location")
    .setLabel("Location / Planet / POI")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., OM-1, Ghost Hollow, outpost name")
    .setRequired(true);

  const objective = new TextInputBuilder()
    .setCustomId("objective")
    .setLabel("Recon Objective")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Intel, route scan, overwatch, ID hostiles, etc.")
    .setRequired(true);

  const hostiles = new TextInputBuilder()
    .setCustomId("hostiles")
    .setLabel("Hostiles")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Unknown / Light / Heavy (type & count if known)")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(Name),
    new ActionRowBuilder().addComponents(system),
    new ActionRowBuilder().addComponents(location),
    new ActionRowBuilder().addComponents(objective),
    new ActionRowBuilder().addComponents(hostiles)
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
    .setLabel("Threats (optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("None / Light / Heavy (details)")
    .setRequired(false);

  const lessons = new TextInputBuilder()
    .setCustomId("lessons")
    .setLabel("Notes / Lessons learned (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Anything to improve next time?")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(outcome),
    new ActionRowBuilder().addComponents(summary),
    new ActionRowBuilder().addComponents(threats),
    new ActionRowBuilder().addComponents(lessons)
  );

  return modal;
}

function buildReconReportModal() {
  const modal = new ModalBuilder().setCustomId(RECON_REPORT_MODAL_ID).setTitle("Phoenix Recon Report");

  const outcome = new TextInputBuilder()
    .setCustomId("outcome")
    .setLabel("Outcome")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Complete / Partial / Aborted")
    .setRequired(true);

  const intel = new TextInputBuilder()
    .setCustomId("intel")
    .setLabel("Intel Summary")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("What did you find? Routes, ships, timing, numbers, etc.")
    .setRequired(true);

  const threats = new TextInputBuilder()
    .setCustomId("threats")
    .setLabel("Threats observed (optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("None / Light / Heavy (details)")
    .setRequired(false);

  const next = new TextInputBuilder()
    .setCustomId("next")
    .setLabel("Recommended next action (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Ex: Avoid route, bring escorts, approach from X, etc.")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(outcome),
    new ActionRowBuilder().addComponents(intel),
    new ActionRowBuilder().addComponents(threats),
    new ActionRowBuilder().addComponents(next)
  );

  return modal;
}

function parseTicketInfo(channel) {
  const topic = channel?.topic || "";
  const requesterMatch = topic.match(/(Rescue|Recon) ticket for (\d+)/);
  const claimedMatch = topic.match(/CLAIMED_BY:(\d+)/);
  return {
    requesterId: requesterMatch ? requesterMatch[2] : null,
    claimedById: claimedMatch ? claimedMatch[1] : null,
  };
}

// ---------- Startup: update panels ----------
client.once("ready", async () => {
  console.log(`🟣 Phoenix Squadron Bot Online as ${client.user.tag}`);

  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const opsChannelId = process.env.RESCUE_CHANNEL_ID; // reuse your existing ops panel channel
  const dutyPanelId = process.env.ON_DUTY_PANEL_ID;
  const opsPanelId = process.env.RESCUE_PANEL_ID; // reuse existing message ID

  if (!onDutyChannelId || !opsChannelId || !dutyPanelId || !opsPanelId) {
    console.log("❌ Missing env vars: ON_DUTY_CHANNEL_ID, RESCUE_CHANNEL_ID, ON_DUTY_PANEL_ID, RESCUE_PANEL_ID");
    return;
  }

  const onDutyChannel = await client.channels.fetch(onDutyChannelId).catch(() => null);
  const opsChannel = await client.channels.fetch(opsChannelId).catch(() => null);

  if (!onDutyChannel || !onDutyChannel.isTextBased()) {
    console.log("❌ Could not access ON_DUTY_CHANNEL_ID.");
    return;
  }
  if (!opsChannel || !opsChannel.isTextBased()) {
    console.log("❌ Could not access RESCUE_CHANNEL_ID.");
    return;
  }

  const dutyMsg = await onDutyChannel.messages.fetch(dutyPanelId).catch(() => null);
  if (dutyMsg) {
    await dutyMsg.edit({ embeds: [buildDutyEmbed(onDutyChannel.guild)], components: [dutyButtonsRow()] });
    console.log("✅ Updated Duty panel (On/Off buttons).");
  } else {
    console.log("❌ Could not fetch Duty panel message (check ON_DUTY_PANEL_ID).");
  }

  const opsMsg = await opsChannel.messages.fetch(opsPanelId).catch(() => null);
  if (opsMsg) {
    await opsMsg.edit({ embeds: [buildOpsEmbed()], components: [opsButtonsRow()] });
    console.log("✅ Updated Ops panel (Extraction + Recon).");
  } else {
    console.log("❌ Could not fetch Ops panel message (check RESCUE_PANEL_ID).");
  }
});

// ---------- Interactions ----------
client.on("interactionCreate", async (interaction) => {
  // BUTTONS
  if (interaction.isButton()) {
    const guild = interaction.guild;
    const member = interaction.member;

    // GO ON DUTY
    if (interaction.customId === "go_on_duty") {
      const role = getRoleByName(guild, ON_DUTY_ROLE);
      if (!role) return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });

      if (member.roles.cache.has(role.id)) {
        return interaction.reply({ content: "🟢 You are already **ON Duty**.", ephemeral: true });
      }

      try {
        await member.roles.add(role);
        await refreshDutyPanel();
        return interaction.reply({ content: "🟢 You are now **ON Duty**.", ephemeral: true });
      } catch (e) {
        console.error("❌ Failed to set ON duty:", e);
        return interaction.reply({ content: "❌ Could not assign role. Check permissions/role order.", ephemeral: true });
      }
    }

    // GO OFF DUTY
    if (interaction.customId === "go_off_duty") {
      const role = getRoleByName(guild, ON_DUTY_ROLE);
      if (!role) return interaction.reply({ content: "❌ Role not found: Phoenix On Duty", ephemeral: true });

      if (!member.roles.cache.has(role.id)) {
        return interaction.reply({ content: "🔴 You are already **OFF Duty**.", ephemeral: true });
      }

      try {
        await member.roles.remove(role);
        await refreshDutyPanel();
        return interaction.reply({ content: "🔴 You are now **OFF Duty**.", ephemeral: true });
      } catch (e) {
        console.error("❌ Failed to set OFF duty:", e);
        return interaction.reply({ content: "❌ Could not remove role. Check permissions/role order.", ephemeral: true });
      }
    }

    // REQUEST EXTRACTION -> MODAL
    if (interaction.customId === "request_rescue") {
      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Rescue ticket for ${interaction.user.id}`
      );
      if (existing) {
        return interaction.reply({ content: `⚠️ You already have an active rescue ticket: ${existing}`, ephemeral: true });
      }
      return interaction.showModal(buildRescueModal());
    }

    // REQUEST RECON -> MODAL
    if (interaction.customId === "request_recon") {
      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Recon ticket for ${interaction.user.id}`
      );
      if (existing) {
        return interaction.reply({ content: `⚠️ You already have an active recon ticket: ${existing}`, ephemeral: true });
      }
      return interaction.showModal(buildReconModal());
    }

    // CLAIM (rescue or recon)
    if (interaction.customId === "claim_rescue" || interaction.customId === "claim_recon") {
      const channel = interaction.channel;

      if (channel.topic && channel.topic.includes("CLAIMED_BY:")) {
        return interaction.reply({ content: "⚠️ This ticket has already been claimed.", ephemeral: true });
      }

      const baseTopic = channel.topic || "";
      const newTopic = `${baseTopic} | CLAIMED_BY:${interaction.user.id}`.slice(0, 1024);
      await channel.setTopic(newTopic).catch(() => {});

      const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
      if (messages) {
        const oldest = messages.last();
        if (oldest) {
          const tag = interaction.customId === "claim_recon" ? "Assigned Recon" : "Assigned Medic";
          const already = oldest.content.includes(tag);
          const updatedContent = already
            ? oldest.content
            : `${oldest.content}\n\n🩺 **${tag}:** <@${interaction.user.id}>`;
          await oldest.edit({ content: updatedContent, components: oldest.components }).catch(() => {});
        }
      }

      await logEvent(interaction.guild, `🔒 **Ticket Claimed** — <@${interaction.user.id}> claimed ${channel}`);
      return interaction.reply({ content: "🔒 Claim confirmed.", ephemeral: true });
    }

    // CLOSE -> REPORT MODAL
    if (interaction.customId === "close_rescue") return interaction.showModal(buildRescueReportModal());
    if (interaction.customId === "close_recon") return interaction.showModal(buildReconReportModal());

    return;
  }

  // RESCUE REQUEST MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === RESCUE_MODAL_ID) {
    const guild = interaction.guild;
    const onDutyRole = getRoleByName(guild, ON_DUTY_ROLE);

    try {
      await interaction.deferReply({ ephemeral: true });

      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Rescue ticket for ${interaction.user.id}`
      );
      if (existing) return interaction.editReply(`⚠️ You already have an active rescue ticket: ${existing}`);

      const name = interaction.fields.getTextInputValue("name");
      const system = interaction.fields.getTextInputValue("system");
      const planet = interaction.fields.getTextInputValue("planet");
      const hostiles = interaction.fields.getTextInputValue("hostiles");
      const notes = interaction.fields.getTextInputValue("notes") || "—";

      const channelName = `rescue-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90);

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
          ...(onDutyRole
            ? [
                {
                  id: onDutyRole.id,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                  ],
                },
              ]
            : []),
        ],
      });

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
        `🎮 **Name:** ${name}\n` +
        `📍 **System:** ${system}\n` +
        `🪐 **Planet/POI:** ${planet}\n` +
        `⚔️ **Hostiles:** ${hostiles}\n` +
        `📝 **Notes:** ${notes}`;

      const activeMedics = getOnDutyCount(guild);

      if (onDutyRole && activeMedics > 0) {
        await channel.send({
          content: `🚨 <@&${onDutyRole.id}> Rescue request from <@${interaction.user.id}>\n\n${details}`,
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
      }

      await logEvent(guild, `🆕 **Rescue Opened** — <@${interaction.user.id}> in ${channel}`);
      return interaction.editReply(`🚑 Rescue channel created: ${channel}`);
    } catch (e) {
      console.error("❌ Rescue request modal submit failed:", e);
      return interaction.reply({ content: "❌ Failed to create rescue ticket. Check logs.", ephemeral: true });
    }
  }

  // RECON REQUEST MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === RECON_MODAL_ID) {
    const guild = interaction.guild;
    const reconRole = getRoleByName(guild, RECON_ROLE);

    try {
      await interaction.deferReply({ ephemeral: true });

      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Recon ticket for ${interaction.user.id}`
      );
      if (existing) return interaction.editReply(`⚠️ You already have an active recon ticket: ${existing}`);

      const name = interaction.fields.getTextInputValue("Name");
      const system = interaction.fields.getTextInputValue("system");
      const location = interaction.fields.getTextInputValue("location");
      const objective = interaction.fields.getTextInputValue("objective");
      const hostiles = interaction.fields.getTextInputValue("hostiles");

      const channelName = `recon-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90);

      const channel = await guild.channels.create({
        name: channelName,
        parent: process.env.RECON_CATEGORY_ID || null,
        type: 0,
        topic: `Recon ticket for ${interaction.user.id}`,
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
          ...(reconRole
            ? [
                {
                  id: reconRole.id,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                  ],
                },
              ]
            : []),
        ],
      });

      await channel.permissionOverwrites.edit(guild.members.me.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_recon").setLabel("🔒 Claim Recon").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_recon").setLabel("✅ Close Recon").setStyle(ButtonStyle.Danger)
      );

      const details =
        `🎮 **Name:** ${name}\n` +
        `📍 **System:** ${system}\n` +
        `📌 **Location/POI:** ${location}\n` +
        `🎯 **Objective:** ${objective}\n` +
        `⚔️ **Hostiles:** ${hostiles}`;

      if (reconRole) {
        await channel.send({
          content: `🛰️ <@&${reconRole.id}> Recon request from <@${interaction.user.id}>\n\n${details}`,
          components: [row],
        });
      } else {
        await channel.send({
          content:
            `🛰️ Recon request from <@${interaction.user.id}>\n\n` +
            `⚠️ **Recon role not found (${RECON_ROLE}).** Create the role to enable pings.\n\n` +
            `${details}`,
          components: [row],
        });
      }

      await logEvent(guild, `🆕 **Recon Opened** — <@${interaction.user.id}> in ${channel}`);
      return interaction.editReply(`🛰️ Recon channel created: ${channel}`);
    } catch (e) {
      console.error("❌ Recon request modal submit failed:", e);
      return interaction.reply({ content: "❌ Failed to create recon ticket. Check logs.", ephemeral: true });
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

      await logEvent(
        guild,
        `📝 **Rescue Report Submitted**\n` +
          `• **Ticket:** ${channel}\n` +
          `• **Requester:** ${requesterId ? `<@${requesterId}>` : "Unknown"}\n` +
          `• **Assigned:** ${claimedById ? `<@${claimedById}>` : "Unassigned"}\n` +
          `• **Submitted By:** <@${interaction.user.id}>\n` +
          `• **Outcome:** ${outcome}\n` +
          `• **Threats:** ${threats}\n` +
          `• **Summary:** ${summary}\n` +
          `• **Notes:** ${lessons}`
      );

      await interaction.editReply("✅ Rescue report submitted. Closing ticket in 5 seconds...");
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    } catch (e) {
      console.error("❌ Rescue report modal submit failed:", e);
      return interaction.reply({ content: "❌ Rescue report failed. Check logs.", ephemeral: true });
    }
  }

  // RECON REPORT MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === RECON_REPORT_MODAL_ID) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;
      const guild = interaction.guild;
      const { requesterId, claimedById } = parseTicketInfo(channel);

      const outcome = interaction.fields.getTextInputValue("outcome");
      const intel = interaction.fields.getTextInputValue("intel");
      const threats = interaction.fields.getTextInputValue("threats") || "—";
      const next = interaction.fields.getTextInputValue("next") || "—";

      await logEvent(
        guild,
        `🛰️ **Recon Report Submitted**\n` +
          `• **Ticket:** ${channel}\n` +
          `• **Requester:** ${requesterId ? `<@${requesterId}>` : "Unknown"}\n` +
          `• **Assigned:** ${claimedById ? `<@${claimedById}>` : "Unassigned"}\n` +
          `• **Submitted By:** <@${interaction.user.id}>\n` +
          `• **Outcome:** ${outcome}\n` +
          `• **Threats:** ${threats}\n` +
          `• **Intel:** ${intel}\n` +
          `• **Next Action:** ${next}`
      );

      await interaction.editReply("✅ Recon report submitted. Closing ticket in 5 seconds...");
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    } catch (e) {
      console.error("❌ Recon report modal submit failed:", e);
      return interaction.reply({ content: "❌ Recon report failed. Check logs.", ephemeral: true });
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
