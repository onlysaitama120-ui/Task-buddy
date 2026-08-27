// verificationInteraction.ts
// Registers a Discord button interaction that opens a modal for Reddit verification.
// This file is imported by the main bot entry point (e.g., src/bot.ts).

import { Client, Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonInteraction } from 'discord.js';
import { AccountService } from '../services/accountService';
import { getConfig } from '../config';

/**
 * Registers the "Verify Reddit" button handler.
 * Expected button customId: "verify_reddit".
 * When clicked, a modal is shown where the user pastes their Reddit profile URL.
 * On submission, we extract the username and store a placeholder Reddit account.
 */
export function registerVerificationInteraction(client: Client) {
  const accountService = new AccountService();

  // Button click → show modal
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    const button = interaction as ButtonInteraction;
    if (button.customId !== 'verify_reddit') return;

    const modal = new ModalBuilder()
      .setCustomId('verify_reddit_modal')
      .setTitle('Reddit Account Verification');

    const urlInput = new TextInputBuilder()
      .setCustomId('reddit_url')
      .setLabel('Your Reddit profile URL')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://www.reddit.com/user/YourUsername')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput);
    modal.addComponents(firstActionRow);

    await button.showModal(modal);
  });

  // Modal submission → process verification
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'verify_reddit_modal') return;

    const redditUrl = interaction.fields.getTextInputValue('reddit_url');
    // Simple extraction of username from URL using a safe regex
    const match = redditUrl.match(/reddit/.com//user//([^//]+)/i);
    const username = match ? match[1] : null;
    if (!username) {
      await interaction.reply({ content: '❌ Could not parse a Reddit username from the URL. Please try again.', ephemeral: true });
      return;
    }

    // Placeholder values for karma & account age – a real implementation would call the Reddit API.
    const placeholderKarma = 0;
    const placeholderAge = 0;

    try {
      await accountService.registerAccount(interaction.user.id, username, placeholderKarma, placeholderAge);
      await interaction.reply({ content: `✅ Reddit account **${username}** linked successfully!`, ephemeral: true });
    } catch (err) {
      console.error('Error linking Reddit account:', err);
      await interaction.reply({ content: '❌ Failed to link Reddit account. Please contact an admin.', ephemeral: true });
    }
  });
}
