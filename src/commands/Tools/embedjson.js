import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const MODAL_ID = 'embedjson_modal';
const JSON_INPUT_ID = 'embedjson_raw';

function normalizeRawJson(raw) {
    let trimmed = raw.trim();

    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
        trimmed = trimmed.slice(3, -3).trim();
        if (trimmed.toLowerCase().startsWith('json')) {
            trimmed = trimmed.slice(4).trim();
        }
    }

    return trimmed;
}

function extractEmbedPayload(rawJson) {
    const parsed = JSON.parse(rawJson);

    if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
            throw new Error('Embed JSON array must contain at least one object.');
        }
        return parsed[0];
    }

    if (parsed.embeds && Array.isArray(parsed.embeds) && parsed.embeds.length > 0) {
        return parsed.embeds[0];
    }

    if (parsed.embed && typeof parsed.embed === 'object') {
        return parsed.embed;
    }

    return parsed;
}

export default {
    data: new SlashCommandBuilder()
        .setName('embedjson')
        .setDescription('Paste raw embed JSON to send a custom embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Optional channel to send the embed to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Missing Permissions', 'You need the **Manage Messages** permission to use `/embedjson`.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(MODAL_ID)
            .setTitle('Paste raw embed JSON')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(JSON_INPUT_ID)
                        .setLabel('Embed JSON')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('{ "title": "My embed", "description": "Hello world" }')
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(4000),
                ),
            );

        try {
            await interaction.showModal(modal);
        } catch (error) {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Unable to Open Modal', 'Could not show the JSON input modal. Try again.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const submitted = await interaction.awaitModalSubmit({
            filter: modalInteraction =>
                modalInteraction.customId === MODAL_ID && modalInteraction.user.id === interaction.user.id,
            time: 120_000,
        }).catch(() => null);

        if (!submitted) {
            return;
        }

        const deferred = await InteractionHelper.safeDefer(submitted, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const rawJson = normalizeRawJson(submitted.fields.getTextInputValue(JSON_INPUT_ID));
        let embedPayload;

        try {
            embedPayload = extractEmbedPayload(rawJson);
        } catch (error) {
            return await InteractionHelper.safeEditReply(submitted, {
                embeds: [errorEmbed('Invalid JSON', error.message || 'Could not parse the provided JSON.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        let embed;
        try {
            embed = EmbedBuilder.from(embedPayload);
        } catch (error) {
            return await InteractionHelper.safeEditReply(submitted, {
                embeds: [errorEmbed('Invalid Embed Data', 'The provided JSON is not a valid embed structure.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
        if (!targetChannel) {
            return await InteractionHelper.safeEditReply(submitted, {
                embeds: [errorEmbed('Channel Not Found', 'No target channel was available.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await targetChannel.send({ embeds: [embed] });
        } catch (error) {
            return await InteractionHelper.safeEditReply(submitted, {
                embeds: [errorEmbed('Send Failed', 'I could not send the embed to that channel. Check my permissions and try again.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        await InteractionHelper.safeEditReply(submitted, {
            embeds: [successEmbed('Embed Sent', `Your embed was posted in ${targetChannel}.`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};
