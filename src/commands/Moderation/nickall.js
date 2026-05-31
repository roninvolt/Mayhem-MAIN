import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nickall')
        .setDescription('Set nicknames for all manageable members in the server')
        .addStringOption((option) =>
            option
                .setName('prefix')
                .setDescription('Prefix to add to each nickname')
                .setRequired(true)
        )
        .addBooleanOption((option) =>
            option
                .setName('include_self')
                .setDescription('Also change your own nickname')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .setDMPermission(false),
    category: 'moderation',

    async execute(interaction, config, client) {
        try {
            if (!interaction.guild) {
                throw new Error('This command can only be used inside a server.');
            }

            const prefix = interaction.options.getString('prefix', true).trim();
            const includeSelf = interaction.options.getBoolean('include_self') ?? false;
            const guild = interaction.guild;
            const me = guild.members.me;

            if (!me) {
                throw new Error('Unable to determine bot member in this guild.');
            }

            if (!me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
                throw new Error('I need the Manage Nicknames permission to rename members.');
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const members = await guild.members.fetch();
            const maxNickLength = 32;
            let processed = 0;
            let updated = 0;
            let skipped = 0;
            let failed = 0;

            for (const member of members.values()) {
                if (member.id === client.user.id) {
                    skipped += 1;
                    continue;
                }

                if (!includeSelf && member.id === interaction.user.id) {
                    skipped += 1;
                    continue;
                }

                if (!member.manageable) {
                    skipped += 1;
                    continue;
                }

                const rawNick = `${prefix}${member.user.username}`;
                let newNick;

                if (prefix.length >= maxNickLength) {
                    newNick = prefix.slice(0, maxNickLength);
                } else if (rawNick.length > maxNickLength) {
                    newNick = `${prefix}${member.user.username.slice(0, maxNickLength - prefix.length)}`;
                } else {
                    newNick = rawNick;
                }

                if (member.nickname === newNick) {
                    skipped += 1;
                    continue;
                }

                processed += 1;

                try {
                    await member.edit({ nick: newNick }, `Mass nickname update by ${interaction.user.tag}`);
                    updated += 1;
                } catch (error) {
                    logger.warn(`Failed to update nickname for ${member.user.tag}:`, error);
                    failed += 1;
                }

                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            const summary = `Processed ${processed} members. Updated ${updated}. Skipped ${skipped}. Failed ${failed}.`;
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed('Mass nickname update complete', summary)
                ]
            });
        } catch (error) {
            logger.error('nickall command failed:', error);
            await handleInteractionError(interaction, error, { subtype: 'nickall_failed' });
        }
    }
};
