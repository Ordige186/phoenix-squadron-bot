const { 
  Client, 
  GatewayIntentBits, 
  PermissionsBitField, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const ON_DUTY_ROLE = "Phoenix On Duty";

client.once("ready", () => {
  console.log("🟣 Phoenix Squadron Bot Online");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const guild = interaction.guild;
  const member = interaction.member;
  const role = guild.roles.cache.find(r => r.name === ON_DUTY_ROLE);

  // Toggle Duty
  if (interaction.customId === "toggle_duty") {
    if (!role) {
      return interaction.reply({ content: "Phoenix On Duty role not found.", ephemeral: true });
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      return interaction.reply({ content: "🟣 You are now OFF Duty.", ephemeral: true });
    } else {
      await member.roles.add(role);
      return interaction.reply({ content: "🟣 You are now ON Duty.", ephemeral: true });
    }
  }

  // Request Rescue
  if (interaction.customId === "request_rescue") {
    if (!role) {
      return interaction.reply({ content: "Phoenix On Duty role not found.", ephemeral: true });
    }

    const channel = await guild.channels.create({
      name: `rescue-${interaction.user.username}`,
      type: 0,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        },
        {
          id: role.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ]
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
      components: [row]
    });

    return interaction.reply({
      content: `🚑 Rescue channel created: ${channel}`,
      ephemeral: true
    });
  }

  if (interaction.customId === "claim_rescue") {
    return interaction.reply({
      content: `🔒 Rescue claimed by <@${interaction.user.id}>`
    });
  }

  if (interaction.customId === "close_rescue") {
    await interaction.reply({ content: "Closing ticket in 5 seconds..." });
    setTimeout(() => interaction.channel.delete(), 5000);
  }
});

client.login(process.env.TOKEN);
