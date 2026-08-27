import { Client, GatewayIntentBits, Partials, Events, REST, Routes, Collection, ChannelType, ChannelSelectMenuBuilder, ActionRowBuilder, ComponentType, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { loadConfig, getOwnerUserId, getConfig } from './config';
import { prisma } from './database/prisma/client';
import { AccountService } from './services/accountService';
import { VerificationService } from './services/verificationService';
import { TaskService } from './services/taskService';
import { TicketService } from './services/ticketService';
import { ProofService } from './services/proofService';
import { StatisticsService } from './services/statisticsService';
import { isTaskMod, requireTaskMod, isOwner, requireOwner, requireAuthorizedGuild } from './permissions';
import { createBatchAnnouncementEmbed, createTaskTicketEmbed, createTaskStatsEmbed, createVerificationStatusEmbed, createBatchListEmbed } from './utils/embeds';
import { TaskType, BatchStatus, TaskStatus } from '@prisma/client';
import { AuthorizedGuildRepository } from './database/repositories';
import { RedditScraperService } from './services/redditScraper';
import express from 'express';

const config = loadConfig();

// Health check server for deployment platforms
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ name: 'Task-buddy', status: 'running' });
});

const healthServer = app.listen(PORT, () => {
  console.log(`🏥 Health check server listening on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const accountService = new AccountService();
const verificationService = new VerificationService();
const taskService = new TaskService();
const ticketService = new TicketService(client);
const proofService = new ProofService();
const statisticsService = new StatisticsService();

const commands = new Collection<string, any>();

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const words = text.split(new RegExp('//s+'));
  for (const word of words) {
    if (word.startsWith('http://') || word.startsWith('https://')) {
      urls.push(word);
    }
  }
  return urls;
}

function stripRedditPrefix(input: string): string {
  if (input.startsWith('u/')) return input.slice(2);
  if (input.startsWith('/u/')) return input.slice(3);
  return input;
}

function extractRedditUsername(input: string): string {
  const lower = input.trim().toLowerCase();
  
  const userIdx = lower.indexOf('/user/');
  if (userIdx !== -1) {
    const after = input.slice(userIdx + 6);
    const end = after.search(/[/?]/);
    return end === -1 ? after : after.slice(0, end);
  }
  
  const uIdx = lower.indexOf('/u/');
  if (uIdx !== -1) {
    const after = input.slice(uIdx + 3);
    const end = after.search(/[/?]/);
    return end === -1 ? after : after.slice(0, end);
  }
  
  return stripRedditPrefix(input.trim());
}

function parseTasksInput(input: string): { comment: string; redditLink: string }[] {
  const lines = input.trim().split('/n').filter(line => line.trim().length > 0);
  const tasks: { comment: string; redditLink: string }[] = [];
  
  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid format: "${line}". Use: comment | https://reddit.com/...`);
    }
    const [comment, link] = parts;
    if (!comment || !link) {
      throw new Error(`Invalid format: "${line}". Both comment and link required.`);
    }
    if (!link.startsWith('http')) {
      throw new Error(`Invalid URL: "${link}". Must be a valid URL.`);
    }
    tasks.push({ comment, redditLink: link });
  }
  return tasks;
}

function parseAccountAge(input: string): number {
  const cleaned = input.trim().toLowerCase();
  const match = cleaned.match(new RegExp('^(\d+)\s*([dwmy])$', 'i'));
  if (!match) {
    throw new Error('Invalid format. Use: 30d, 4w, 6m, 1y (days, weeks, months, years). Examples: 30d, 4w, 6m, 1y, 2w, 3m');
  }
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'd': return value;
    case 'w': return value * 7;
    case 'm': return value * 30;
    case 'y': return value * 365;
    default: throw new Error('Invalid unit. Use d, w, m, or y');
  }
}

function sendDashboardEmbed(channel: any, guild: any, taskModRole: any) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Task-buddy Dashboard')
    .setDescription('Welcome to the Task-buddy control panel. Use the buttons below to navigate.')
    .setColor(0x0099ff)
    .addFields(
      { name: '👤 Member Actions', value: 'Available to all verified members', inline: false },
      { name: '⚙️ Moderator Actions', value: 'Available to task-mods and administrators', inline: false },
      { name: '📊 Statistics', value: 'View your personal statistics', inline: false },
    )
    .setFooter({ text: 'Task-buddy Dashboard • Click a button below' })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_verify')
      .setLabel('✅ Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId('dash_unverify')
      .setLabel('❌ Unverify')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
    new ButtonBuilder()
      .setCustomId('dash_stats')
      .setLabel('📊 My Stats')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📊'),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_createbatch')
      .setLabel('📦 Create Batch')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📦'),
    new ButtonBuilder()
      .setCustomId('dash_announce')
      .setLabel('📢 Announce')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📢'),
    new ButtonBuilder()
      .setCustomId('dash_batches')
      .setLabel('📋 View Batches')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋'),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('dash_totalregisters')
      .setLabel('👥 Total Registered')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👥'),
    new ButtonBuilder()
      .setCustomId('dash_config')
      .setLabel('⚙️ Config')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚙️'),
  );

  return channel.send({ embeds: [embed], components: [row1, row2, row3] });
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  console.log(`🤖 Task-buddy is ready!`);

  try {
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    
    await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: [] });
    console.log('✅ Cleared old global commands');
    
    for (const guild of readyClient.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guild.id), {
        body: [
          {
            name: 'register',
            description: 'Register your Reddit account (auto-verify via profile URL or manual entry)',
            options: [
              { name: 'reddit_profile', description: 'Your Reddit profile URL (e.g., https://reddit.com/u/username)', type: 3, required: false },
              { name: 'username', description: 'Your Reddit username (without u/) - manual entry if profile is private', type: 3, required: false },
              { name: 'karma', description: 'Your Reddit karma - required if using manual entry', type: 4, required: false },
              { name: 'account_age', description: 'Account age (e.g., 30d, 4w, 6m, 1y) - required if using manual entry', type: 3, required: false },
            ],
          },
          {
            name: 'verify',
            description: 'Check your Reddit account verification status',
          },
          {
            name: 'createbatch',
            description: 'Create a new task batch (task-mod only)',
            options: [
              { name: 'name', description: 'Batch name', type: 3, required: true },
              { name: 'type', description: 'Task type', type: 3, required: true, choices: [
                { name: 'Comment', value: 'COMMENT' },
                { name: 'Post', value: 'POST' },
                { name: 'Upvote', value: 'UPVOTE' },
                { name: 'Custom', value: 'CUSTOM' },
              ]},
              { name: 'task_count', description: 'Number of tasks in this batch', type: 4, required: true },
              { name: 'pay_per_task', description: 'Payment per task in USD', type: 10, required: true },
              { name: 'min_karma', description: 'Minimum karma required', type: 4, required: false },
              { name: 'min_account_age', description: 'Minimum account age (days)', type: 4, required: false },
            ],
          },
          {
            name: 'addtasks',
            description: 'Add tasks to a batch (task-mod only)',
            options: [
              { name: 'batch_id', description: 'Batch ID', type: 3, required: true },
              { name: 'tasks', description: 'Tasks as JSON array: [{"comment": "...", "reddit_link": "..."}]', type: 3, required: true },
            ],
          },
          {
            name: 'announce',
            description: 'Announce a batch in the announcement channel (task-mod only)',
            options: [
              { name: 'batch_id', description: 'Batch ID to announce', type: 3, required: true },
            ],
          },
          {
            name: 'announcecustom',
            description: 'Post a custom announcement message (task-mod only)',
            options: [
              { name: 'channel', description: 'Channel to post in (defaults to announcement channel)', type: 7, required: false },
            ],
          },
          {
            name: 'batches',
            description: 'List all task batches (task-mod only)',
          },
          {
            name: 'complete',
            description: 'Mark a task as completed (task-mod only)',
            options: [
              { name: 'claim_id', description: 'Claim ID', type: 3, required: true },
            ],
          },
          {
            name: 'timeout',
            description: 'Mark a task as timed out (task-mod only)',
            options: [
              { name: 'claim_id', description: 'Claim ID', type: 3, required: true },
            ],
          },
          {
            name: 'taskstats',
            description: 'View task statistics for a member',
            options: [
              { name: 'member', description: 'Member to check (defaults to yourself)', type: 6, required: false },
            ],
          },
          {
            name: 'config',
            description: 'Configure bot settings (task-mod only)',
            options: [
              { name: 'announcement_channel', description: 'Announcement channel', type: 7, required: false },
              { name: 'task_mod_role', description: 'Task moderator role', type: 8, required: false },
              { name: 'task_category', description: 'Task category', type: 7, required: false },
              { name: 'min_karma', description: 'Minimum karma', type: 4, required: false },
              { name: 'min_account_age', description: 'Minimum account age (days)', type: 4, required: false },
              { name: 'task_deadline', description: 'Task deadline (minutes)', type: 4, required: false },
            ],
          },
          {
            name: 'authorize',
            description: 'Authorize a guild to use Task-buddy (bot owner only)',
            options: [
              { name: 'guild_id', description: 'Guild ID to authorize', type: 3, required: true },
            ],
          },
          {
            name: 'deauthorize',
            description: 'Deauthorize a guild from using Task-buddy (bot owner only)',
            options: [
              { name: 'guild_id', description: 'Guild ID to deauthorize', type: 3, required: true },
            ],
          },
          {
            name: 'setup',
            description: 'Initial server setup for Task-buddy (server admin only)',
          },
        ],
      });
      console.log('✅ Slash commands registered');
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModal(interaction);
  } else if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
    await handleSelectMenu(interaction);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.inGuild()) return;

  const ticket = await ticketService.getTicketByChannelId(message.channel.id);
  if (!ticket || ticket.isClosed) return;

  const claim = await taskService.getClaimById(ticket.claimId);
  if (!claim) return;

  if (message.author.id !== claim.userId) return;

  const content = message.content.trim().toLowerCase();

  if (content === 'reject') {
    if (claim.status === TaskStatus.CLAIMED || claim.status === TaskStatus.IN_PROGRESS || claim.status === TaskStatus.PROOF_SUBMITTED) {
      await taskService.rejectTask(claim.id, message.author.id);
      await statisticsService.recordRejection(message.author.id);
      await message.reply('❌ Task rejected. Ticket will be closed.');
    } else {
      await message.reply('❌ Cannot reject task in current status.');
    }
    return;
  }

  const urls = extractUrls(message.content);
  if (urls.length === 0) return;

  for (const url of urls) {
    if (ProofService.isValidRedditUrl(url)) {
      if (claim.status === TaskStatus.CLAIMED || claim.status === TaskStatus.IN_PROGRESS) {
        await taskService.submitProof(claim.id, url);
        await message.reply(ProofService.formatProofSubmittedMessage(Number(claim.payAmount)));
      }
      return;
    }
  }
});

async function handleSlashCommand(interaction: any) {
  const { commandName, options, user, member, guild } = interaction;

  try {
    switch (commandName) {
      case 'register': {
        const redditProfile = options.getString('reddit_profile');
        const username = options.getString('username');
        const karma = options.getInteger('karma');
        const accountAgeStr = options.getString('account_age');
        
        if (redditProfile) {
          await interaction.deferReply({ ephemeral: true });
          
          const extractedUsername = extractRedditUsername(redditProfile);
          console.log(`[Register] Input: ${redditProfile}, Extracted: ${extractedUsername}`);
          
          const redditScraper = new RedditScraperService();
          const userInfo = await redditScraper.fetchUserInfo(extractedUsername);
          
          if (!userInfo) {
            await interaction.editReply({ content: '❌ Could not fetch Reddit profile. Make sure the profile is public and the username is correct.' });
            return;
          }
          
          const config = getConfig();
          const verification = redditScraper.verifyUser(userInfo, config.MIN_REDDIT_KARMA, config.MIN_REDDIT_ACCOUNT_AGE_DAYS);
          
          if (!verification.verified) {
            await interaction.editReply({ content: `❌ Verification failed: ${verification.reason}` });
            return;
          }
          
          const accountAgeDays = Math.floor((Date.now() / 1000 - userInfo.created_utc) / 86400);
          const totalKarma = userInfo.link_karma + userInfo.comment_karma;
          
          await prisma.user.upsert({
            where: { id: user.id },
            update: { username: user.username, discriminator: user.discriminator || null, avatar: user.avatarURL() || null },
            create: { id: user.id, username: user.username, discriminator: user.discriminator || null, avatar: user.avatarURL() || null },
          });
          
          await accountService.registerAccount(user.id, userInfo.name, totalKarma, accountAgeDays);
          
          const guildId = interaction.guildId!;
          const status = await verificationService.getVerificationStatus(user.id, guildId);
          
          await interaction.editReply({ 
            content: `✅ Verified! u/${userInfo.name} | Karma: ${totalKarma} | Account age: ${accountAgeDays} days` 
          });
          break;
        }
        
        if (username && karma !== null && accountAgeStr) {
          const accountAge = parseAccountAge(accountAgeStr);
          
          await prisma.user.upsert({
            where: { id: user.id },
            update: { username: user.username, discriminator: user.discriminator || null, avatar: user.avatarURL() || null },
            create: { id: user.id, username: user.username, discriminator: user.discriminator || null, avatar: user.avatarURL() || null },
          });
          
          await accountService.registerAccount(user.id, username, karma, accountAge);
          
          const guildId = interaction.guildId!;
          const status = await verificationService.getVerificationStatus(user.id, guildId);
          
          await interaction.reply({ embeds: [createVerificationStatusEmbed(status)], ephemeral: true });
          break;
        }
        
        await interaction.reply({ 
          content: '❌ Provide either:/n• `reddit_profile` (Reddit profile URL for auto-verification)/n• OR `username` + `karma` + `account_age` (manual entry for private profiles)', 
          ephemeral: true 
        });
        break;
      }

      case 'verify': {
        const guildId = interaction.guildId!;
        const status = await verificationService.getVerificationStatus(user.id, guildId);
        await interaction.reply({ embeds: [createVerificationStatusEmbed(status)], ephemeral: true });
        break;
      }

      case 'createbatch': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const name = options.getString('name');
        const type = options.getString('type') as TaskType;
        const taskCount = options.getInteger('task_count');
        const payPerTask = options.getNumber('pay_per_task');
        const minKarma = options.getInteger('min_karma') ?? config.MIN_REDDIT_KARMA;
        const minAccountAgeStr = options.getString('min_account_age');
        const minAccountAge = minAccountAgeStr ? parseAccountAge(minAccountAgeStr) : config.MIN_REDDIT_ACCOUNT_AGE_DAYS;

        const modal = {
          customId: `create_batch_modal:${name}:${type}:${taskCount}:${payPerTask}:${minKarma}:${minAccountAge}`,
          title: `Create Batch: ${name}`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  customId: 'tasks_json',
                  label: 'Tasks (JSON array)',
                  style: 2,
                  placeholder: '[{"comment":"...","reddit_link":"https://reddit.com/..."},...]',
                  required: true,
                  maxLength: 4000,
                },
              ],
            },
          ],
        };

        await interaction.showModal(modal);
        break;
      }

      case 'addtasks': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const batchId = options.getString('batch_id');
        const tasksJson = options.getString('tasks');

        let tasks: { comment: string; redditLink: string }[];
        try {
          tasks = JSON.parse(tasksJson);
        } catch {
          await interaction.reply({ content: '❌ Invalid JSON format', ephemeral: true });
          return;
        }

        if (!Array.isArray(tasks) || tasks.length === 0) {
          await interaction.reply({ content: '❌ Tasks must be a non-empty array', ephemeral: true });
          return;
        }

        for (const task of tasks) {
          if (!task.comment || !task.redditLink) {
            await interaction.reply({ content: '❌ Each task must have comment and reddit_link', ephemeral: true });
            return;
          }
        }

        const batch = await taskService.getBatchById(batchId);
        if (!batch) {
          await interaction.reply({ content: '❌ Batch not found', ephemeral: true });
          return;
        }

        await taskService.taskRepo.createMany(batchId, tasks);
        await interaction.reply({ content: `✅ Added ${tasks.length} tasks to batch ${batch.name}`, ephemeral: true });
        break;
      }

      case 'announce': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const batchId = options.getString('batch_id');
        const batch = await taskService.getBatchById(batchId);

        if (!batch) {
          await interaction.reply({ content: '❌ Batch not found', ephemeral: true });
          return;
        }

        if (batch.status !== BatchStatus.ACTIVE) {
          await interaction.reply({ content: '❌ Batch is not active', ephemeral: true });
          return;
        }

        const botConfig = await taskService.configRepo.get(guildId);
        const announcementChannelId = botConfig?.announcementChannelId;
        
        if (!announcementChannelId) {
          await interaction.reply({ content: '❌ Announcement channel not configured. Use /config or /setup.', ephemeral: true });
          return;
        }

        const announcementChannel = guild.channels.cache.get(announcementChannelId);
        if (!announcementChannel || !announcementChannel.isTextBased()) {
          await interaction.reply({ content: '❌ Announcement channel not found or invalid.', ephemeral: true });
          return;
        }

        const availableCount = await taskService.getAvailableTaskCount(batchId);

        const { embed, components } = createBatchAnnouncementEmbed({
          id: batch.id,
          name: batch.name,
          type: batch.type,
          taskCount: batch.taskCount,
          payPerTask: Number(batch.payPerTask),
          minKarma: batch.minKarma,
          minAccountAge: batch.minAccountAge,
          availableCount,
        });

        const message = await announcementChannel.send({ embeds: [embed as any], components: components as any });

        await taskService.updateBatchAnnouncement(batchId, message.id, announcementChannel.id);

        await interaction.reply({ content: `✅ Batch announced in <#${announcementChannel.id}>`, ephemeral: true });
        break;
      }

      case 'announcecustom': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const channelOption = options.getChannel('channel');
        const channelId = channelOption ? channelOption.id : 'default';

        const modal = {
          customId: `announce_custom_modal:${channelId}`,
          title: '📢 Custom Announcement',
          components: [
            {
              type: 1,
              components: [
                { type: 4, customId: 'announce_message', label: 'Announcement message', style: 2, required: true, maxLength: 2000 },
              ],
            },
          ],
        };

        await interaction.showModal(modal);
        break;
      }

      case 'batches': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const batches = await taskService.getAllBatches(guildId);
        const batchData = await Promise.all(batches.map(async (b) => ({
          id: b.id,
          name: b.name,
          type: b.type,
          taskCount: b.taskCount,
          payPerTask: Number(b.payPerTask),
          status: b.status,
          availableCount: await taskService.getAvailableTaskCount(b.id),
        })));

        await interaction.reply({ embeds: [createBatchListEmbed(batchData)], ephemeral: true });
        break;
      }

      case 'complete': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const claimId = options.getString('claim_id');
        const claim = await taskService.getClaimById(claimId);
        if (!claim) {
          await interaction.reply({ content: '❌ Claim not found', ephemeral: true });
          return;
        }
        await taskService.completeTask(claimId, user.id);
        await statisticsService.recordCompletion(claim.userId, Number(claim.payAmount));

        await interaction.reply({ content: '✅ Task marked as completed', ephemeral: true });
        break;
      }

      case 'timeout': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const claimId = options.getString('claim_id');
        const claim = await taskService.getClaimById(claimId);
        if (!claim) {
          await interaction.reply({ content: '❌ Claim not found', ephemeral: true });
          return;
        }
        await taskService.timeoutTask(claimId, user.id);
        await statisticsService.recordTimeout(claim.userId);

        await interaction.reply({ content: '⏰ Task marked as timed out', ephemeral: true });
        break;
      }

      case 'taskstats': {
        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);
        
        const targetUser = options.getUser('member') ?? user;
        const stats = await statisticsService.getUserStatistics(targetUser.id);
        const memberObj = await guild.members.fetch(targetUser.id).catch(() => null);

        await interaction.reply({ embeds: [createTaskStatsEmbed({ user: targetUser }, stats)], ephemeral: true });
        break;
      }

      case 'authorize': {
        requireOwner(user.id);

        const guildId = options.getString('guild_id');
        if (!guildId) {
          await interaction.reply({ content: '❌ Guild ID is required.', ephemeral: true });
          return;
        }

        const authorizedGuildRepo = new AuthorizedGuildRepository();
        await authorizedGuildRepo.authorize(guildId, user.id);

        await interaction.reply({ content: `✅ Guild ${guildId} has been authorized.`, ephemeral: true });
        break;
      }

      case 'deauthorize': {
        requireOwner(user.id);

        const guildId = options.getString('guild_id');
        if (!guildId) {
          await interaction.reply({ content: '❌ Guild ID is required.', ephemeral: true });
          return;
        }

        const authorizedGuildRepo = new AuthorizedGuildRepository();
        await authorizedGuildRepo.deauthorize(guildId);

        await interaction.reply({ content: `✅ Guild ${guildId} has been deauthorized.`, ephemeral: true });
        break;
      }

      case 'config': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const announcementChannel = options.getChannel('announcement_channel');
        const taskModRole = options.getRole('task_mod_role');
        const taskCategory = options.getChannel('task_category');
        const minKarma = options.getInteger('min_karma');
        const minAccountAgeStr = options.getString('min_account_age');
        const minAccountAge = minAccountAgeStr ? parseAccountAge(minAccountAgeStr) : undefined;
        const taskDeadline = options.getInteger('task_deadline');

        const updates: any = {};
        if (announcementChannel) updates.announcementChannelId = announcementChannel.id;
        if (taskModRole) updates.taskModRoleId = taskModRole.id;
        if (taskCategory) updates.taskCategoryId = taskCategory.id;
        if (minKarma) updates.minKarma = minKarma;
        if (minAccountAge !== undefined) updates.minAccountAge = minAccountAge;
        if (taskDeadline) updates.taskDeadlineMinutes = taskDeadline;

        if (Object.keys(updates).length === 0) {
          await interaction.reply({ content: '❌ No configuration changes provided', ephemeral: true });
          return;
        }

        await taskService.configRepo.upsert(guildId, updates);
        await interaction.reply({ content: '✅ Configuration updated', ephemeral: true });
        break;
      }

      case 'set': {
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const subcommand = options.getSubcommand();
        if (subcommand === 'announcement') {
          const channel = interaction.channel;
          if (!channel || !channel.isTextBased()) {
            await interaction.reply({ content: '❌ This command must be used in a text channel', ephemeral: true });
            return;
          }

          await taskService.configRepo.upsert(guildId, { announcementChannelId: channel.id });
          await interaction.reply({ content: `✅ Announcement channel set to <#${channel.id}>`, ephemeral: true });
        }
        break;
      }

      case 'setup': {
        if (!member.permissions.has('Administrator') && interaction.guild?.ownerId !== user.id) {
          await interaction.reply({ content: '❌ Only server administrators can run initial setup.', ephemeral: true });
          return;
        }

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`setup_announcement_channel:${guildId}`)
          .setPlaceholder('Select the announcement channel')
          .setChannelTypes([ChannelType.GuildText])
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        await interaction.reply({ 
          content: `🔧 **Task-buddy Setup**/n/nPlease select the channel where task announcements will be posted:`, 
          components: [row], 
          ephemeral: true 
        });
        break;
      }
    }
  } catch (error: any) {
    console.error(`Error in ${commandName}:`, error);
    const message = error.message || 'An error occurred';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

async function handleButton(interaction: any) {
  const [action, ...params] = interaction.customId.split(':');

  try {
    switch (action) {
      case 'claim_task': {
        const batchId = params[0];
        const guildId = interaction.guildId!;
        await interaction.deferReply({ ephemeral: true });

        const verification = await verificationService.checkVerification(interaction.user.id, guildId);
        if (!verification.verified) {
          await interaction.editReply({ content: `❌ You need a verified Reddit account to claim tasks.${verification.reason ? '/n' + verification.reason : ''}` });
          return;
        }

        const existingClaim = await taskService.getUserClaimInBatch(interaction.user.id, batchId);
        if (existingClaim) {
          await interaction.editReply({ content: '❌ You have already claimed a task from this batch.' });
          return;
        }

        const redditAccount = await accountService.getAccount(interaction.user.id);
        if (!redditAccount) {
          await interaction.editReply({ content: '❌ No Reddit account registered. Use /register first.' });
          return;
        }

        const batch = await taskService.getBatchById(batchId);
        if (!batch || batch.status !== BatchStatus.ACTIVE) {
          await interaction.editReply({ content: '❌ Batch not found or not active.' });
          return;
        }

        const availableCount = await taskService.getAvailableTaskCount(batchId);
        if (availableCount === 0) {
          await interaction.editReply({ content: '❌ No tasks available in this batch.' });
          return;
        }

        const { claim, task } = await taskService.claimTask(batchId, interaction.user.id, redditAccount.id, guildId);

        const guild = interaction.guild!;
        const ticketChannel = await ticketService.createTicket(claim.id, interaction.user, guild, guildId);

        const ticketEmbed = createTaskTicketEmbed({
          comment: task.comment,
          redditLink: task.redditLink,
          type: batch.type,
          payAmount: Number(claim.payAmount),
          redditUsername: redditAccount.username,
          dueAt: task.dueAt!,
        });

        await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed as any] });

        const availableCountAfter = await taskService.getAvailableTaskCount(batchId);

        if (batch.announcementId && batch.announcementChannelId) {
          const announcementChannel = client.channels.cache.get(batch.announcementChannelId);
          if (announcementChannel && announcementChannel.isTextBased()) {
            const announcementMessage = await announcementChannel.messages.fetch(batch.announcementId).catch(() => null);
            if (announcementMessage) {
              const { embed, components } = createBatchAnnouncementEmbed({
                id: batch.id,
                name: batch.name,
                type: batch.type,
                taskCount: batch.taskCount,
                payPerTask: Number(batch.payPerTask),
                minKarma: batch.minKarma,
                minAccountAge: batch.minAccountAge,
                availableCount: availableCountAfter,
              });
              await announcementMessage.edit({ embeds: [embed as any], components: components as any });
            }
          }
        } else {
          const guildId = interaction.guildId!;
          const botConfig = await taskService.configRepo.get(guildId);
          if (botConfig?.announcementChannelId && batch.announcementId) {
            const announcementChannel = client.channels.cache.get(botConfig.announcementChannelId);
            if (announcementChannel && announcementChannel.isTextBased()) {
              const announcementMessage = await announcementChannel.messages.fetch(batch.announcementId).catch(() => null);
              if (announcementMessage) {
                const { embed, components } = createBatchAnnouncementEmbed({
                  id: batch.id,
                  name: batch.name,
                  type: batch.type,
                  taskCount: batch.taskCount,
                  payPerTask: Number(batch.payPerTask),
                  minKarma: batch.minKarma,
                  minAccountAge: batch.minAccountAge,
                  availableCount: availableCountAfter,
                });
                await announcementMessage.edit({ embeds: [embed as any], components: components as any });
              }
            }
          }
        }

        await interaction.editReply({ content: `✅ Task claimed! Your private ticket: <#${ticketChannel.id}>` });
        break;
      }

      case 'dash_verify': {
        await interaction.showModal({
          customId: 'verify_reddit_modal',
          title: 'Verify Reddit Account',
          components: [
            {
              type: 1,
              components: [
                { type: 4, customId: 'reddit_profile', label: 'Reddit Profile URL', style: 1, required: true, maxLength: 100, placeholder: 'https://reddit.com/u/yourusername' },
              ],
            },
          ],
        });
        break;

      case 'dash_unverify': {
        await interaction.deferReply({ ephemeral: true });
        const guildId = interaction.guildId!;
        const redditAccount = await accountService.getAccount(interaction.user.id);
        if (!redditAccount) {
          await interaction.editReply({ content: '❌ No Reddit account registered.' });
          return;
        }
        await prisma.redditAccount.delete({ where: { userId: interaction.user.id } });
        await interaction.editReply({ content: '✅ Your Reddit account has been unlinked. You can register again anytime.' });
        break;
      }

      case 'dash_stats': {
        await interaction.deferReply({ ephemeral: true });
        const stats = await statisticsService.getUserStatistics(interaction.user.id);
        const embed = createTaskStatsEmbed({ user: interaction.user }, stats);
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'dash_createbatch': {
        const member = interaction.member;
        requireTaskMod(member);

        const guildId = interaction.guildId!;
        await requireAuthorizedGuild(guildId);

        const modal = {
          customId: 'create_batch_modal',
          title: 'Create Task Batch',
          components: [
            {
              type: 1,
              components: [
                { type: 4, customId: 'batch_name', label: 'Batch Name', style: 1, required: true, maxLength: 100 },
              ],
            },
            {
              type: 1,
              components: [
                { type: 4, customId: 'batch_type', label: 'Task Type', style: 1, required: true, maxLength: 20 },
              ],
            },
            {
              type: 1,
              components: [
                { type: 4, customId: 'task_count', label: 'Number of Tasks (1-20)', style: 1, required: true, maxLength: 2, placeholder: '1-20' },
              ],
            },
            {
              type: 1,
              components: [
                { type: 4, customId: 'pay_per_task', label: 'Pay per Task (USD)', style: 1, required: true, maxLength: 10, placeholder: 'e.g. 0.50' },
              ],
            },
type: 1,
              components: [
                { type: 4, customId: 'tasks_input', label: 'Tasks (one per line: comment | reddit_url)', style: 2, required: true, maxLength: 4000, placeholder: 'Great post! | https://r/.../nThanks! | https://r/.../def456' },
              ],
            },
          ],
        };

        await interaction.showModal(modal);
        break;
      }

      case 'dash_announce': {
        const member = interaction.member;
        if (!member.roles.cache.some((r: any) => r.name === 'task-mod')) {
          await interaction.reply({ content: '❌ Only task-mods can announce batches.', ephemeral: true });
          return;
        }
        const batches = await taskService.getAllBatches(interaction.guildId!);
        if (batches.length === 0) {
          await interaction.reply({ content: '❌ No batches available to announce.', ephemeral: true });
          return;
        }
        const batchOptions = batches.slice(0, 25).map(b => ({
          label: `${b.name} (${b.type})`,
          value: b.id,
          description: `${b.taskCount} tasks • $${b.payPerTask.toFixed(2)}/task`,
        }));
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('dash_announce_select')
            .setPlaceholder('Select a batch to announce')
            .addOptions(batchOptions),
        );
        await interaction.reply({ content: 'Select a batch to announce:', components: [row], ephemeral: true });
        break;
      }

      case 'dash_batches': {
        const batches = await taskService.getAllBatches(interaction.guildId!);
        if (batches.length === 0) {
          await interaction.reply({ content: 'No batches found.', ephemeral: true });
          return;
        }
        const batchData = await Promise.all(batches.map(async (b) => ({
          id: b.id,
          name: b.name,
          type: b.type,
          taskCount: b.taskCount,
          payPerTask: Number(b.payPerTask),
          status: b.status,
          availableCount: await taskService.getAvailableTaskCount(b.id),
        })));
        const embed = createBatchListEmbed(batchData);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'dash_totalregisters': {
        const member = interaction.member;
        if (!member.permissions.has('Administrator') && interaction.guild?.ownerId !== interaction.user.id) {
          await interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
          return;
        }
        const accounts = await prisma.redditAccount.findMany({
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        });
        const count = accounts.length;
        if (count === 0) {
          await interaction.reply({ content: '👥 No registered accounts yet.', ephemeral: true });
          return;
        }
        const accountList = accounts.map(a => `• **u/${a.username}** — <@${a.userId}> (Karma: ${a.karma}, Age: ${a.accountAge}d)`).join('/n');
        await interaction.reply({ content: `👥 **Total registered accounts: ${count}**/n/n${accountList}`, ephemeral: true });
        break;
      }

      case 'dash_config': {
        const member = interaction.member;
        if (!member.permissions.has('Administrator') && interaction.guild?.ownerId !== interaction.user.id) {
          await interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
          return;
        }
        const guildId = interaction.guildId!;
        const botConfig = await taskService.configRepo.get(guildId);
        const config = getConfig();
        await interaction.reply({
          content: `⚙️ **Current Configuration**

**Min Karma:** ${botConfig?.minKarma ?? config.MIN_REDDIT_KARMA}
**Min Account Age:** ${botConfig?.minAccountAge ?? config.MIN_REDDIT_ACCOUNT_AGE_DAYS} days
**Task Deadline:** ${botConfig?.taskDeadlineMinutes ?? config.TASK_DEADLINE_MINUTES} minutes
**Announcement Channel:** ${botConfig?.announcementChannelId ? `<#${botConfig.announcementChannelId}>` : 'Not set'}
**Task Mod Role:** ${botConfig?.taskModRoleId ? `<@&${botConfig.taskModRoleId}>` : 'Not set'}
**Task Category:** ${botConfig?.taskCategoryId ? `<#${botConfig.taskCategoryId}>` : 'Not set'}`, ephemeral: true });
        break;
      }
    }
  } catch (error: any) {
    console.error(`Button error (${action}):`, error);
    const message = error.message || 'An error occurred';
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: `❌ ${message}` });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

async function handleModal(interaction: any) {
  const [action, ...params] = interaction.customId.split(':');

  try {
    switch (action) {
      case 'create_batch_step1': {
        const name = interaction.fields.getTextInputValue('batch_name');
        const type = interaction.fields.getTextInputValue('batch_type') as TaskType;
        const taskCount = parseInt(interaction.fields.getTextInputValue('task_count'));
        const payPerTask = parseFloat(interaction.fields.getTextInputValue('pay_per_task'));

        if (isNaN(taskCount) || taskCount < 1 || taskCount > 20) {
          await interaction.reply({ content: '❌ Task count must be between 1 and 20', ephemeral: true });
          return;
        }

        // Show first task modal
        const modal = {
          customId: `create_batch_task:1:${name}:${type}:${taskCount}:${payPerTask}`,
          title: `Create Task 1 of 1`,
          components: [
            {
              type: 1,
              components: [
                { type: 4, customId: 'task_comment', label: 'Comment', style: 2, required: true, maxLength: 1000, placeholder: 'Enter the comment to post' },
              ],
            },
            {
              type: 1,
              components: [
                { type: 4, customId: 'task_link', label: 'Reddit Link', style: 1, required: true, maxLength: 500, placeholder: 'https://reddit.com/r/.../comments/...' },
              ],
            },
          ],
        };

        await interaction.showModal(modal);
        break;
      }

      case 'verify_reddit_modal': {
        const redditProfile = interaction.fields.getTextInputValue('reddit_profile');
        await interaction.deferReply({ ephemeral: true });
        
        const extractedUsername = extractRedditUsername(redditProfile);
        const redditScraper = new RedditScraperService();
        const userInfo = await redditScraper.fetchUserInfo(extractedUsername);
        
        if (!userInfo) {
          await interaction.editReply({ content: '❌ Could not fetch Reddit profile. Make sure the profile is public and the username is correct.' });
          return;
        }
        
        await accountService.registerAccount(interaction.user.id, userInfo.username, userInfo.link_karma, userInfo.accountAge);
        const status = await verificationService.getVerificationStatus(interaction.user.id, interaction.guildId!);
        
        await interaction.editReply({ embeds: [createVerificationStatusEmbed(status)], ephemeral: true });
        break;
      }
        // params: [taskIndex, totalTasks, name, type, payPerTask, collectedTasksJson]
        const [taskIndexStr, totalTasksStr, name, type, payPerTaskStr, collectedJson] = params;
        const taskIndex = parseInt(taskIndexStr);
        const totalTasks = parseInt(totalTasksStr);
        const payPerTask = parseFloat(payPerTaskStr);

        let collectedTasks: { comment: string; redditLink: string }[] = [];
        try {
          collectedTasks = JSON.parse(collectedJson);
        } catch {
          // ignore, start fresh
        }

        const modal = {
          customId: `create_batch_task:${taskIndex}:${name}:${type}:${totalTasks}:${payPerTask}:${JSON.stringify([])}`,
          title: `Task ${taskIndex} of ${totalTasks}`,
          components: [
            {
              type: 1,
              components: [
                { type: 4, customId: 'task_comment', label: 'Comment', style: 2, required: true, maxLength: 1000, placeholder: 'Enter the comment to post' },
              ],
            },
            {
              type: 1,
              components: [
                { type: 4, customId: 'task_link', label: 'Reddit Link', style: 1, required: true, maxLength: 500, placeholder: 'https://reddit.com/r/.../comments/...' },
              ],
            },
          ],
        };

        await interaction.showModal(modal);
        break;
      }

      case 'create_batch_task_submit': {
        const [taskIndexStr, totalTasksStr, name, type, payPerTaskStr, collectedJson] = params;
        const taskIndex = parseInt(taskIndexStr);
        const totalTasks = parseInt(totalTasksStr);
        const payPerTask = parseFloat(payPerTaskStr);

        let collectedTasks: { comment: string; redditLink: string }[] = [];
        try {
          collectedTasks = JSON.parse(collectedJson);
        } catch {
          collectedTasks = [];
        }

        const comment = interaction.fields.getTextInputValue('task_comment');
        const link = interaction.fields.getTextInputValue('task_link');

        if (!comment || !link) {
          await interaction.reply({ content: '❌ Both comment and link are required', ephemeral: true });
          return;
        }

        collectedTasks.push({ comment, redditLink: link });

        if (taskIndex < totalTasks) {
          // Show next task modal
          const nextIndex = taskIndex + 1;
          const modal = {
            customId: `create_batch_task:${nextIndex}:${name}:${type}:${totalTasks}:${payPerTask}:${JSON.stringify(collectedTasks)}`,
            title: `Task ${nextIndex} of ${totalTasks}`,
            components: [
              {
                type: 1,
                components: [
                  { type: 4, customId: 'task_comment', label: 'Comment', style: 2, required: true, maxLength: 1000, placeholder: 'Enter the comment to post' },
                ],
              },
              {
                type: 1,
                components: [
                  { type: 4, customId: 'task_link', label: 'Reddit Link', style: 1, required: true, maxLength: 500, placeholder: 'https://reddit.com/r/.../comments/...' },
                ],
              },
            ],
          };
          await interaction.showModal(modal);
        } else {
          // All tasks collected, create batch
          const tasks = collectedTasks;
          const config = getConfig();

          const batch = await taskService.createBatch({
            name,
            type: type as TaskType,
            taskCount: totalTasks,
            payPerTask,
            minKarma: config.MIN_REDDIT_KARMA,
            minAccountAge: config.MIN_REDDIT_ACCOUNT_AGE_DAYS,
            createdBy: interaction.user.id,
            guildId: interaction.guildId!,
            tasks,
          });

          await interaction.reply({ content: `✅ Batch created: ${name} (${batch.id}) with ${tasks.length} tasks`, ephemeral: true });
        }
        break;
      }

      case 'announce_custom_modal': {
        const channelId = params[0];
        const message = interaction.fields.getTextInputValue('announce_message');

        const guildId = interaction.guildId!;
        const guild = interaction.guild!;

        // Determine target channel: specified channel or configured announcement channel
        let targetChannel;
        if (channelId && channelId !== 'default') {
          targetChannel = guild.channels.cache.get(channelId);
        } else {
          const botConfig = await taskService.configRepo.get(guildId);
          const announcementChannelId = botConfig?.announcementChannelId;
          if (!announcementChannelId) {
            await interaction.reply({ content: '❌ Announcement channel not configured. Use /config or /setup.', ephemeral: true });
            return;
          }
          targetChannel = guild.channels.cache.get(announcementChannelId);
        }

        if (!targetChannel || !targetChannel.isTextBased()) {
          await interaction.reply({ content: '❌ Target channel not found or invalid.', ephemeral: true });
          return;
        }

        await targetChannel.send(message);
        await interaction.reply({ content: `✅ Announcement posted in <#${targetChannel.id}>`, ephemeral: true });
        break;
      }

      case 'create_batch_modal': {
        const [name, type, taskCountStr, payPerTaskStr] = params;
        const taskCount = parseInt(taskCountStr);
        const payPerTask = parseFloat(payPerTaskStr);

        const tasksInput = interaction.fields.getTextInputValue('tasks_input');
        const tasks = parseTasksInput(tasksInput);

        if (tasks.length !== taskCount) {
          await interaction.reply({ content: `❌ Must provide exactly ${taskCount} tasks (one per line)`, ephemeral: true });
          return;
        }

        for (const task of tasks) {
          if (!task.comment || !task.redditLink) {
            await interaction.reply({ content: '❌ Each task must have both comment and reddit URL', ephemeral: true });
            return;
          }
        }

        const batch = await taskService.createBatch({
          name,
          type: type as TaskType,
          taskCount,
          payPerTask,
          minKarma: config.MIN_REDDIT_KARMA,
          minAccountAge: config.MIN_REDDIT_ACCOUNT_AGE_DAYS,
          createdBy: interaction.user.id,
          guildId: interaction.guildId!,
          tasks,
        });

        await interaction.reply({ content: `✅ Batch created: ${batch.name} (${batch.id}) with ${tasks.length} tasks`, ephemeral: true });
break;
      }
    }
  } catch (error: any) {
    console.error(`Modal error (${action}):`, error);
    const message = error.message || 'An error occurred';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

async function handleSelectMenu(interaction: any) {
  const [action, guildId] = interaction.customId.split(':');

  try {
    switch (action) {
      case 'setup_announcement_channel': {
        if (!interaction.guildId || interaction.guildId !== guildId) {
          await interaction.reply({ content: '❌ Invalid guild.', ephemeral: true });
          return;
        }

        if (!interaction.member?.permissions.has('Administrator') && interaction.guild?.ownerId !== interaction.user.id) {
          await interaction.reply({ content: '❌ Only server administrators can run initial setup.', ephemeral: true });
          return;
        }

        await requireAuthorizedGuild(guildId);

        const selectedChannel = interaction.channels.first();
        if (!selectedChannel || !selectedChannel.isTextBased()) {
          await interaction.reply({ content: '❌ Please select a valid text channel.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild!;

        let taskModRole = guild.roles.cache.find((r: any) => r.name === 'task-mod');
        if (!taskModRole) {
          taskModRole = await guild.roles.create({
            name: 'task-mod',
            color: 0x0099ff,
            reason: 'Task-buddy: Auto-created task moderator role during setup',
          });
        }

        let taskCategory = guild.channels.cache.find((c: any) => c.name === 'Task-buddy' && c.type === 4);
        if (!taskCategory) {
          taskCategory = await guild.channels.create({
            name: 'Task-buddy',
            type: 4,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: ['ViewChannel'],
              },
              {
                id: taskModRole.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
              },
            ],
          });
        }

        await taskService.configRepo.upsert(guildId, {
          announcementChannelId: selectedChannel.id,
          taskModRoleId: taskModRole.id,
          taskCategoryId: taskCategory.id,
        });

        let dashboardChannel = guild.channels.cache.find(
          (c: any) => c.name === 'dashboard' && c.parentId === taskCategory.id
        );
        if (!dashboardChannel) {
          dashboardChannel = await guild.channels.create({
            name: 'dashboard',
            type: ChannelType.GuildText,
            parent: taskCategory.id,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                allow: ['ViewChannel', 'ReadMessageHistory'],
                deny: ['SendMessages'],
              },
              {
                id: taskModRole.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
              },
            ],
          });
        }

        await taskService.configRepo.upsert(guildId, {
          announcementChannelId: selectedChannel.id,
          taskModRoleId: taskModRole.id,
          taskCategoryId: taskCategory.id,
        });

        await sendDashboardEmbed(dashboardChannel, guild, taskModRole);

        await interaction.editReply({ 
          content: `✅ **Task-buddy setup complete!**

` +
            `📢 Announcement channel: <#${selectedChannel.id}>
` +
            `👑 Task-mod role: <@&${taskModRole.id}> (assign this to moderators)
` +
            `📁 Task category: ${taskCategory.name}
` +
            `📊 Dashboard: <#${dashboardChannel.id}>

` +
            `Next steps:
` +
            `1. Assign the **task-mod** role to your moderators
` +
            `2. Use /createbatch to create your first task batch
` +
            `3. Use /announce to post it in the announcement channel`
        });
        break;
      }

      case 'dash_announce_select': {
        const batchId = interaction.values[0];
        await interaction.deferReply({ ephemeral: true });

        const batch = await taskService.getBatchById(batchId);
        if (!batch || batch.status !== BatchStatus.ACTIVE) {
          await interaction.editReply({ content: '❌ Batch not found or not active.', ephemeral: true });
          return;
        }

        const guildId = interaction.guildId!;
        const botConfig = await taskService.configRepo.get(guildId);
        const announcementChannelId = botConfig?.announcementChannelId;
        
        if (!announcementChannelId) {
          await interaction.editReply({ content: '❌ Announcement channel not configured.', ephemeral: true });
          return;
        }

        const announcementChannel = interaction.guild?.channels.cache.get(announcementChannelId);
        if (!announcementChannel || !announcementChannel.isTextBased()) {
          await interaction.editReply({ content: '❌ Announcement channel not found or invalid.', ephemeral: true });
          return;
        }

        const availableCount = await taskService.getAvailableTaskCount(batchId);

        const { embed, components } = createBatchAnnouncementEmbed({
          id: batch.id,
          name: batch.name,
          type: batch.type,
          taskCount: batch.taskCount,
          payPerTask: Number(batch.payPerTask),
          minKarma: batch.minKarma,
          minAccountAge: batch.minAccountAge,
          availableCount,
        });

        const message = await announcementChannel.send({ embeds: [embed as any], components: components as any });

        await taskService.updateBatchAnnouncement(batchId, message.id, announcementChannel.id);

        await interaction.editReply({ content: `✅ Batch announced in <#${announcementChannel.id}>`, ephemeral: true });
        break;
      }
    }
  } catch (error: any) {
    console.error(`Select menu error (${action}):`, error);
    const message = error.message || 'An error occurred';
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: `❌ ${message}` });
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  healthServer.close(() => {
    console.log('Health server closed');
    process.exit(0);
  });
  await client.destroy();
});

client.login(config.DISCORD_TOKEN);