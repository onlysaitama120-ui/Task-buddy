import {
  Client,
  Interaction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonInteraction,
} from 'discord.js';
import { AccountService } from '../services/accountService';

/**
 * Handles the “Verify Reddit” button → modal workflow.
 *   - Button customId: "verify_reddit"
 *   - Modal customId: "verify_reddit_modal"
 *   - User provides a full Reddit profile URL (e.g. https://www.reddit.com/user/YourName).
 *   - The username is extracted with a safe regex and stored as a placeholder account.
 */
export function registerVerificationInteraction(client: Client) {
  const accountService = new AccountService();

  // ---- Show modal when the verify button is clicked ----
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

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput);
    modal.addComponents(firstRow);

    await button.showModal(modal);
  });

  // ---- Process the modal submission ----
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'verify_reddit_modal') return;

    const redditUrl = interaction.fields.getTextInputValue('reddit_url');

    // **Correct regex – extracts the username from a Reddit profile URL**
    const match = redditUrl.match(/reddit\.com\/user\/([^\/]+)/i);
    const username = match ? match[1] : null;

    if (!username) {
      await interaction.reply({
        content: '❌ Could not parse a Reddit username from the URL. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Placeholder values – replace with real Reddit API calls later if desired
    const placeholderKarma = 0;
    const placeholderAge = 0;

    try {
      await accountService.registerAccount(
        interaction.user.id,
        username,
        placeholderKarma,
        placeholderAge
      );
      await interaction.reply({
        content: `✅ Reddit account **${username}** linked successfully!`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('Error linking Reddit account:', err);
      await interaction.reply({
        content: '❌ Failed to link Reddit account. Please contact an admin.',
        ephemeral: true,
      });
    }
  });
}