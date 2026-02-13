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

// -------------------- CONFIG (Names) --------------------
const ON_DUTY_ROLE = "Phoenix On Duty";
const BLACKHAWK_ROLE = "Blackhawk Recon";

// -------------------- MODAL IDs --------------------
const MEDICAL_MODAL_ID = "medical_request_modal";
const MEDICAL_REPORT_MODAL_ID = "medical_report_modal";

const BLACKHAWK_MODAL_ID = "blackhawk_request_modal";
const BLACKHAWK_REPORT_MODAL_ID = "blackhawk_report_modal";

// -------------------- HELPERS --------------------
function getRoleByName(guild, roleName) {
  return guild.roles.cache.find((r) => r.name === roleName) || null;
}

function getRoleCount(guild, roleName) {
  const role = getRoleByName(guild, roleName);
  return role ? role.members.size : 0;
}

function buildDutyEmbed(guild) {
  const activeCount = getRoleCount(guild, ON_DUTY_ROLE);
  return {
    title: "🟣 Phoenix Squadron — Duty Status",
    description:
      "**Response Protocol Active**\n\n" +
      `🩺 **Phoenix On Duty Active:** **${activeCount}**\n\n` +
      "Set your response status:\n" +
      "• On Duty → You will be pinged for Medical/Extraction tickets\n" +
      "• Off Duty → No notifications",
    color: 0x6a0dad,
    footer: { text: "Phoenix Response System" },
  };
}

function buildMedicalEmbed() {
  return {
    title: "🩺 Phoenix — Medical / Extraction Requests",
    description:
      "Open a **private medical/extraction ticket**.\n\n" +
      "You will be asked for:\n" +
      "• In-game name (IGN)\n" +
      "• System\n" +
      "• Planet/POI\n" +
      "• Hostiles\n" +
      "• Notes",
    color: 0x6a0dad,
    footer: { text: "Phoenix Medical Dispatch" },
  };
}

function buildBlackhawkEmbed() {
  return {
    title: "🛰️ Blackhawk Recon — Recon Requests",
    description:
      "Open a **private recon ticket** for intel / overwatch / route scan.\n\n" +
      "You will be asked for:\n" +
      "• In-game name (IGN)\n" +
      "• System\n" +
      "• Location/POI\n" +
      "• Objective\n" +
      "• Hostiles",
    color: 0x111111,
    footer: { text: "Blackhawk Recon Cell" },
  };
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

function medicalButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("request_medical")
      .setLabel("Medical / Extraction")
      .setStyle(ButtonStyle.Danger)
  );
}

function blackhawkButtonsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("request_blackhawk")
      .setLabel("Request Blackhawk Recon")
      .setStyle(ButtonStyle.Primary)
  );
}

async function logEvent(guild, text) {
  const logId = process.env.LOG_CHANNEL_ID;
  if (!logId) return;

  const ch = await client.channels.fetch(logId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  await ch.send(text).catch(() => {});
}

async function upsertPanelMessage(channel, panelMessageId, payload, createLabel) {
  // Updates an existing message if ID is provided & valid, otherwise creates a new one.
  // If it creates a new one, it prints the new message ID so you can copy into Railway vars.
  if (panelMessageId) {
    const msg = await channel.messages.fetch(panelMessageId).catch(() => null);
    if (msg) {
      await msg.edit(payload);
      return { mode: "updated", messageId: msg.id };
    }
  }

  const created = await channel.send(payload);
  console.log(`🆕 Created new ${createLabel} panel message: ${created.id}`);
  return { mode: "created", messageId: created.id };
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

function parseTicketInfo(channel) {
  const topic = channel?.topic || "";
  const requesterMatch = topic.match(/(Medical|Blackhawk) ticket for (\d+)/);
  const claimedMatch = topic.match(/CLAIMED_BY:(\d+)/);
  return {
    kind: requesterMatch ? requesterMatch[1] : null,
    requesterId: requesterMatch ? requesterMatch[2] : null,
    claimedById: claimedMatch ? claimedMatch[1] : null,
  };
}

// -------------------- MODALS --------------------
function buildMedicalModal() {
  const modal = new ModalBuilder().setCustomId(MEDICAL_MODAL_ID).setTitle("Medical / Extraction Request");

  const ign = new TextInputBuilder()
    .setCustomId("ign")
    .setLabel("In-game name (IGN)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Bob")
    .setRequired(true);

  const system = new TextInputBuilder()
    .setCustomId("system")
    .setLabel("System")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Stanton, Pyro, Nyx")
    .setRequired(true);

  const planet = new TextInputBuilder()
    .setCustomId("planet")
    .setLabel("Planet / POI")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Hurston, Daymar, Ruin Station")
    .setRequired(true);

  const hostiles = new TextInputBuilder()
    .setCustomId("hostiles")
    .setLabel("Hostiles")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("None / Light / Heavy (details)")
    .setRequired(true);

  const notes = new TextInputBuilder()
    .setCustomId("notes")
    .setLabel("Notes (optional)")
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

function buildBlackhawkModal() {
  const modal = new ModalBuilder().setCustomId(BLACKHAWK_MODAL_ID).setTitle("Blackhawk Recon Request");

  const ign = new TextInputBuilder()
    .setCustomId("ign")
    .setLabel("In-game name (IGN)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Bob")
    .setRequired(true);

  const system = new TextInputBuilder()
    .setCustomId("system")
    .setLabel("System")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Stanton, Pyro, Nyx")
    .setRequired(true);

  const location = new TextInputBuilder()
    .setCustomId("location")
    .setLabel("Location / POI")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("OM-1, Ghost Hollow, outpost name")
    .setRequired(true);

  const objective = new TextInputBuilder()
    .setCustomId("objective")
    .setLabel("Objective")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Overwatch, intel, route scan, ID hostiles")
    .setRequired(true);

  const hostiles = new TextInputBuilder()
    .setCustomId("hostiles")
    .setLabel("Hostiles")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Unknown / Light / Heavy (details)")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ign),
    new ActionRowBuilder().addComponents(system),
    new ActionRowBuilder().addComponents(location),
    new ActionRowBuilder().addComponents(objective),
    new ActionRowBuilder().addComponents(hostiles)
  );

  return modal;
}

function buildMedicalReportModal() {
  const modal = new ModalBuilder().setCustomId(MEDICAL_REPORT_MODAL_ID).setTitle("Medical / Extraction Report");

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
    .setLabel("Notes / Lessons (optional)")
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

function buildBlackhawkReportModal() {
  const modal = new ModalBuilder().setCustomId(BLACKHAWK_REPORT_MODAL_ID).setTitle("Blackhawk Recon Report");

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
    .setPlaceholder("Avoid route, bring escorts, approach from X, etc.")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(outcome),
    new ActionRowBuilder().addComponents(intel),
    new ActionRowBuilder().addComponents(threats),
    new ActionRowBuilder().addComponents(next)
  );

  return modal;
}

// -------------------- READY: UPDATE PANELS --------------------
client.once("ready", async () => {
  console.log(`🟣 Phoenix Squadron Bot Online as ${client.user.tag}`);

  // Duty panel
  const onDutyChannelId = process.env.ON_DUTY_CHANNEL_ID;
  const onDutyPanelId = process.env.ON_DUTY_PANEL_ID;

  // Medical panel (reusing your existing RESCUE_CHANNEL_ID / RESCUE_PANEL_ID vars)
  const medicalChannelId = process.env.RESCUE_CHANNEL_ID;
  const medicalPanelId = process.env.RESCUE_PANEL_ID;

  // Blackhawk panel (new vars; if not provided, it will default to using medical channel)
  const blackhawkChannelId = process.env.BLACKHAWK_CHANNEL_ID || medicalChannelId;
  const blackhawkPanelId = process.env.BLACKHAWK_PANEL_ID;

  if (!onDutyChannelId || !medicalChannelId) {
    console.log("❌ Missing env vars: ON_DUTY_CHANNEL_ID and RESCUE_CHANNEL_ID are required.");
    return;
  }

  const dutyChannel = await client.channels.fetch(onDutyChannelId).catch(() => null);
  const medicalChannel = await client.channels.fetch(medicalChannelId).catch(() => null);
  const blackhawkChannel = await client.channels.fetch(blackhawkChannelId).catch(() => null);

  if (!dutyChannel || !dutyChannel.isTextBased()) {
    console.log("❌ Could not access ON_DUTY_CHANNEL_ID.");
    return;
  }
  if (!medicalChannel || !medicalChannel.isTextBased()) {
    console.log("❌ Could not access RESCUE_CHANNEL_ID.");
    return;
  }
  if (!blackhawkChannel || !blackhawkChannel.isTextBased()) {
    console.log("❌ Could not access BLACKHAWK_CHANNEL_ID (or fallback).");
    return;
  }

  // Update/Create Duty panel message
  if (onDutyPanelId) {
    const dutyMsg = await dutyChannel.messages.fetch(onDutyPanelId).catch(() => null);
    if (dutyMsg) {
      await dutyMsg.edit({ embeds: [buildDutyEmbed(dutyChannel.guild)], components: [dutyButtonsRow()] });
      console.log("✅ Updated Duty panel.");
    } else {
      console.log("❌ ON_DUTY_PANEL_ID not found. (Wrong message ID?)");
    }
  } else {
    const created = await upsertPanelMessage(
      dutyChannel,
      null,
      { embeds: [buildDutyEmbed(dutyChannel.guild)], components: [dutyButtonsRow()] },
      "Duty"
    );
    console.log(`ℹ️ Set Railway variable ON_DUTY_PANEL_ID = ${created.messageId} to prevent duplicates.`);
  }

  // Update/Create Medical panel message
  if (medicalPanelId) {
    const medMsg = await medicalChannel.messages.fetch(medicalPanelId).catch(() => null);
    if (medMsg) {
      await medMsg.edit({ embeds: [buildMedicalEmbed()], components: [medicalButtonsRow()] });
      console.log("✅ Updated Medical/Extraction panel.");
    } else {
      console.log("❌ RESCUE_PANEL_ID not found. (Wrong message ID?)");
    }
  } else {
    const created = await upsertPanelMessage(
      medicalChannel,
      null,
      { embeds: [buildMedicalEmbed()], components: [medicalButtonsRow()] },
      "Medical/Extraction"
    );
    console.log(`ℹ️ Set Railway variable RESCUE_PANEL_ID = ${created.messageId} to prevent duplicates.`);
  }

  // Update/Create Blackhawk panel message (separate “window”)
  if (blackhawkPanelId) {
    const bhMsg = await blackhawkChannel.messages.fetch(blackhawkPanelId).catch(() => null);
    if (bhMsg) {
      await bhMsg.edit({ embeds: [buildBlackhawkEmbed()], components: [blackhawkButtonsRow()] });
      console.log("✅ Updated Blackhawk Recon panel.");
    } else {
      console.log("❌ BLACKHAWK_PANEL_ID not found. (Wrong message ID?)");
    }
  } else {
    const created = await upsertPanelMessage(
      blackhawkChannel,
      null,
      { embeds: [buildBlackhawkEmbed()], components: [blackhawkButtonsRow()] },
      "Blackhawk Recon"
    );
    console.log(`ℹ️ Set Railway variable BLACKHAWK_PANEL_ID = ${created.messageId} to prevent duplicates.`);
  }
});

// -------------------- INTERACTIONS --------------------
client.on("interactionCreate", async (interaction) => {
  // BUTTONS
  if (interaction.isButton()) {
    const guild = interaction.guild;
    const member = interaction.member;

    // Duty On
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
        return interaction.reply({ content: "❌ Could not assign role. Check role order & permissions.", ephemeral: true });
      }
    }

    // Duty Off
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
        return interaction.reply({ content: "❌ Could not remove role. Check role order & permissions.", ephemeral: true });
      }
    }

    // Medical request button -> show modal
    if (interaction.customId === "request_medical") {
      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Medical ticket for ${interaction.user.id}`
      );
      if (existing) {
        return interaction.reply({ content: `⚠️ You already have an active medical ticket: ${existing}`, ephemeral: true });
      }
      return interaction.showModal(buildMedicalModal());
    }

    // Blackhawk recon request button -> show modal
    if (interaction.customId === "request_blackhawk") {
      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Blackhawk ticket for ${interaction.user.id}`
      );
      if (existing) {
        return interaction.reply({ content: `⚠️ You already have an active Blackhawk ticket: ${existing}`, ephemeral: true });
      }
      return interaction.showModal(buildBlackhawkModal());
    }

    // Claim buttons
    if (interaction.customId === "claim_medical" || interaction.customId === "claim_blackhawk") {
      const channel = interaction.channel;

      if (channel.topic && channel.topic.includes("CLAIMED_BY:")) {
        return interaction.reply({ content: "⚠️ This ticket has already been claimed.", ephemeral: true });
      }

      const baseTopic = channel.topic || "";
      const newTopic = `${baseTopic} | CLAIMED_BY:${interaction.user.id}`.slice(0, 1024);
      await channel.setTopic(newTopic).catch(() => {});

      await logEvent(guild, `🔒 **Ticket Claimed** — <@${interaction.user.id}> claimed ${channel}`);
      return interaction.reply({ content: "🔒 Claim confirmed.", ephemeral: true });
    }

    // Close buttons -> show report modals
    if (interaction.customId === "close_medical") return interaction.showModal(buildMedicalReportModal());
    if (interaction.customId === "close_blackhawk") return interaction.showModal(buildBlackhawkReportModal());

    return;
  }

  // MEDICAL MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === MEDICAL_MODAL_ID) {
    const guild = interaction.guild;
    const onDutyRole = getRoleByName(guild, ON_DUTY_ROLE);

    try {
      await interaction.deferReply({ ephemeral: true });

      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Medical ticket for ${interaction.user.id}`
      );
      if (existing) return interaction.editReply(`⚠️ You already have an active medical ticket: ${existing}`);

      const ign = interaction.fields.getTextInputValue("ign");
      const system = interaction.fields.getTextInputValue("system");
      const planet = interaction.fields.getTextInputValue("planet");
      const hostiles = interaction.fields.getTextInputValue("hostiles");
      const notes = interaction.fields.getTextInputValue("notes") || "—";

      const channelName = `medical-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90);

      const channel = await guild.channels.create({
        name: channelName,
        parent: process.env.TICKET_CATEGORY_ID || null,
        type: 0,
        topic: `Medical ticket for ${interaction.user.id}`,
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_medical").setLabel("🔒 Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_medical").setLabel("✅ Close Ticket").setStyle(ButtonStyle.Danger)
      );

      const details =
        `🎮 **IGN:** ${ign}\n` +
        `📍 **System:** ${system}\n` +
        `🪐 **Planet/POI:** ${planet}\n` +
        `⚔️ **Hostiles:** ${hostiles}\n` +
        `📝 **Notes:** ${notes}`;

      if (onDutyRole && getRoleCount(guild, ON_DUTY_ROLE) > 0) {
        await channel.send({
          content: `🚨 <@&${onDutyRole.id}> **Medical/Extraction Request** from <@${interaction.user.id}>\n\n${details}`,
          components: [row],
        });
      } else {
        await channel.send({
          content:
            `🚨 **Medical/Extraction Request** from <@${interaction.user.id}>\n\n` +
            `⚠️ **No Phoenix medics are currently On Duty.** Response may be delayed.\n\n${details}`,
          components: [row],
        });
      }

      await logEvent(guild, `🆕 **Medical Ticket Opened** — <@${interaction.user.id}> in ${channel}`);
      return interaction.editReply(`🩺 Medical ticket created: ${channel}`);
    } catch (e) {
      console.error("❌ Medical modal submit failed:", e);
      return interaction.reply({ content: "❌ Failed to create medical ticket. Check logs.", ephemeral: true });
    }
  }

  // BLACKHAWK MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === BLACKHAWK_MODAL_ID) {
    const guild = interaction.guild;
    const blackhawkRole = getRoleByName(guild, BLACKHAWK_ROLE);

    try {
      await interaction.deferReply({ ephemeral: true });

      const existing = guild.channels.cache.find(
        (c) => c.type === 0 && c.topic === `Blackhawk ticket for ${interaction.user.id}`
      );
      if (existing) return interaction.editReply(`⚠️ You already have an active Blackhawk ticket: ${existing}`);

      const ign = interaction.fields.getTextInputValue("ign");
      const system = interaction.fields.getTextInputValue("system");
      const location = interaction.fields.getTextInputValue("location");
      const objective = interaction.fields.getTextInputValue("objective");
      const hostiles = interaction.fields.getTextInputValue("hostiles");

      const channelName = `bh-recon-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90);

      const channel = await guild.channels.create({
        name: channelName,
        parent: process.env.BLACKHAWK_CATEGORY_ID || null,
        type: 0,
        topic: `Blackhawk ticket for ${interaction.user.id}`,
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
          ...(blackhawkRole
            ? [
                {
                  id: blackhawkRole.id,
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_blackhawk").setLabel("🔒 Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_blackhawk").setLabel("✅ Close Ticket").setStyle(ButtonStyle.Danger)
      );

      const details =
        `🎮 **IGN:** ${ign}\n` +
        `📍 **System:** ${system}\n` +
        `📌 **Location/POI:** ${location}\n` +
        `🎯 **Objective:** ${objective}\n` +
        `⚔️ **Hostiles:** ${hostiles}`;

      if (blackhawkRole) {
        await channel.send({
          content: `🛰️ <@&${blackhawkRole.id}> **Blackhawk Recon Request** from <@${interaction.user.id}>\n\n${details}`,
          components: [row],
        });
      } else {
        await channel.send({
          content:
            `🛰️ **Blackhawk Recon Request** from <@${interaction.user.id}>\n\n` +
            `⚠️ **Role not found:** "${BLACKHAWK_ROLE}" (create it to enable pings)\n\n${details}`,
          components: [row],
        });
      }

      await logEvent(guild, `🆕 **Blackhawk Ticket Opened** — <@${interaction.user.id}> in ${channel}`);
      return interaction.editReply(`🛰️ Blackhawk recon ticket created: ${channel}`);
    } catch (e) {
      console.error("❌ Blackhawk modal submit failed:", e);
      return interaction.reply({ content: "❌ Failed to create Blackhawk ticket. Check logs.", ephemeral: true });
    }
  }

  // MEDICAL REPORT SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === MEDICAL_REPORT_MODAL_ID) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;
      const guild = interaction.guild;
      const info = parseTicketInfo(channel);

      const outcome = interaction.fields.getTextInputValue("outcome");
      const summary = interaction.fields.getTextInputValue("summary");
      const threats = interaction.fields.getTextInputValue("threats") || "—";
      const lessons = interaction.fields.getTextInputValue("lessons") || "—";

      await logEvent(
        guild,
        `📝 **Medical/Extraction Report**\n` +
          `• **Ticket:** ${channel}\n` +
          `• **Requester:** ${info.requesterId ? `<@${info.requesterId}>` : "Unknown"}\n` +
          `• **Assigned:** ${info.claimedById ? `<@${info.claimedById}>` : "Unassigned"}\n` +
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
      console.error("❌ Medical report submit failed:", e);
      return interaction.reply({ content: "❌ Report failed. Check logs.", ephemeral: true });
    }
  }

  // BLACKHAWK REPORT SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === BLACKHAWK_REPORT_MODAL_ID) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const channel = interaction.channel;
      const guild = interaction.guild;
      const info = parseTicketInfo(channel);

      const outcome = interaction.fields.getTextInputValue("outcome");
      const intel = interaction.fields.getTextInputValue("intel");
      const threats = interaction.fields.getTextInputValue("threats") || "—";
      const next = interaction.fields.getTextInputValue("next") || "—";

      await logEvent(
        guild,
        `🛰️ **Blackhawk Recon Report**\n` +
          `• **Ticket:** ${channel}\n` +
          `• **Requester:** ${info.requesterId ? `<@${info.requesterId}>` : "Unknown"}\n` +
          `• **Assigned:** ${info.claimedById ? `<@${info.claimedById}>` : "Unassigned"}\n` +
          `• **Submitted By:** <@${interaction.user.id}>\n` +
          `• **Outcome:** ${outcome}\n` +
          `• **Threats:** ${threats}\n` +
          `• **Intel:** ${intel}\n` +
          `• **Next Action:** ${next}`
      );

      await interaction.editReply("✅ Report submitted. Closing ticket in 5 seconds...");
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      return;
    } catch (e) {
      console.error("❌ Blackhawk report submit failed:", e);
      return interaction.reply({ content: "❌ Report failed. Check logs.", ephemeral: true });
    }
  }
});

// -------------------- LOGIN --------------------
const token = process.env.TOKEN;
if (!token || token.trim().length < 20) {
  console.error("❌ TOKEN env var missing or looks wrong. Set Railway Variable TOKEN and redeploy.");
  process.exit(1);
}

client.login(token).catch((e) => {
  console.error("❌ Login failed:", e);
  process.exit(1);
});
