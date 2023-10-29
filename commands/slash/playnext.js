const SlashCommand = require("../../lib/SlashCommand");
const { MessageEmbed } = require("discord.js");
const escapeMarkdown = require("discord.js").Util.escapeMarkdown;

const command = new SlashCommand()
  .setName("playnext")
  .setDescription("Search and add the requested song and play it after the current song ended")
  .addStringOption((option) =>
    option
      .setName("query")
      .setDescription("What am I looking for?")
      .setAutocomplete(true)
      .setRequired(true)
  )
  .setRun(async (client, interaction, options) => {
    let channel = await client.getChannel(client, interaction);
    if (!channel) {
        return;
    }
    
    let player;
    if (client.manager) {
        player = client.manager.players.get(interaction.guild.id);
    } else {
        return interaction.reply({
            embeds: [
                new MessageEmbed()
                    .setColor("RED")
                    .setDescription("Lavalink node is not connected"),
            ],
        });
    }
    
    if (!player) {
        return interaction.reply({
            embeds: [
                new MessageEmbed()
                    .setColor("RED")
                    .setDescription("I'm not in a channel."),
            ],
            ephemeral: true,
        });
    }
    
    await interaction.deferReply();

    if (channel.type == "GUILD_STAGE_VOICE") {
      setTimeout(() => {
        if (interaction.guild.members.me.voice.suppress == true) {
          try {
            interaction.guild.members.me.voice.setSuppressed(false);
          } catch (e) {
            interaction.guild.members.me.voice.setRequestToSpeak(true);
          }
        }
      }, 2000);
    }

    const ret = await interaction.reply({
      embeds: [
        new MessageEmbed()
          .setColor(client.config.embedColor)
          .setDescription(":mag_right: **Searching...**"),
      ],
      fetchReply: true,
    });

    let query = options.getString("query", true);
    let res = await player.search(query, interaction.user).catch((err) => {
      client.error(err);
      return {
        loadType: "LOAD_FAILED",
      };
    });

    if (res.loadType === "LOAD_FAILED") {
      if (!player.queue.current) {
        player.destroy();
      }
      await interaction
        .editReply({
          embeds: [
            new MessageEmbed()
              .setColor("RED")
              .setDescription("There was an error while searching"),
          ],
        })
        .catch(this.warn);
    }

    if (res.loadType === "NO_MATCHES") {
      if (!player.queue.current) {
        player.destroy();
      }
      await interaction
        .editReply({
          embeds: [
            new MessageEmbed()
              .setColor("RED")
              .setDescription("No results were found"),
          ],
        })
        .catch(this.warn);
    }

    if (res.loadType === "TRACK_LOADED" || res.loadType === "SEARCH_RESULT") {
      // Add the requested song to the queue after the current song
      player.queue.addAfterCurrent(res.tracks[0]);

      var title = escapeMarkdown(res.tracks[0].title);
      var title = title.replace(/\]/g, "");
      var title = title.replace(/\[/g, "");
      let addQueueEmbed = new MessageEmbed()
        .setColor(client.config.embedColor)
        .setAuthor({ name: "Added to queue", iconURL: client.config.iconURL })
        .setDescription(`[${title}](${res.tracks[0].uri})` || "No Title")
        .setURL(res.tracks[0].uri)
        .addFields(
          {
            name: "Added by",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          {
            name: "Duration",
            value: res.tracks[0].isStream
              ? `\`LIVE 🔴 \``
              : `\`${client.ms(res.tracks[0].duration, {
                  colonNotation: true,
                  secondsDecimalDigits: 0,
                })}\``,
            inline: true,
          }
        );

      try {
        addQueueEmbed.setThumbnail(
          res.tracks[0].displayThumbnail("maxresdefault")
        );
      } catch (err) {
        addQueueEmbed.setThumbnail(res.tracks[0].thumbnail);
      }

      if (player.queue.totalSize > 1) {
        addQueueEmbed.addFields({
          name: "Position in queue",
          value: `${player.queue.size}`,
          inline: true,
        });
      } else {
        player.queue.previous = player.queue.current;
      }

      await interaction.editReply({ embeds: [addQueueEmbed] }).catch(this.warn);
    }

    if (res.loadType === "PLAYLIST_LOADED") {
      player.queue.addAfterCurrent(res.tracks);

      if (
        !player.playing &&
        !player.paused &&
        player.queue.totalSize === res.tracks.length
      ) {
        player.play();
      }

      let playlistEmbed = new MessageEmbed()
        .setColor(client.config.embedColor)
        .setAuthor({
          name: "Playlist added to queue",
          iconURL: client.config.iconURL,
        })
        .setThumbnail(res.tracks[0].thumbnail)
        .setDescription(`[${res.playlist.name}](${query})`)
        .addFields(
          {
            name: "Enqueued",
            value: `\`${res.tracks.length}\` songs`,
            inline: true,
          },
          {
            name: "Playlist duration",
            value: `\`${client.ms(res.playlist.duration, {
              colonNotation: true,
              secondsDecimalDigits: 0,
            })}\``,
            inline: true,
          }
        );

      await interaction.editReply({ embeds: [playlistEmbed] }).catch(this.warn);
    }

    if (ret) setTimeout(() => ret.delete().catch(this.warn), 20000);
    return ret;
  });

module.exports = command;
