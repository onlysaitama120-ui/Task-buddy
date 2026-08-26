import { Client, Guild, ChannelType, PermissionFlagsBits, OverwriteType, TextChannel, User, Role } from 'discord.js';
import { TicketRepository, TaskClaimRepository, BotConfigRepository } from '../database/repositories';
import { getConfig } from '../config';

export class TicketService {
  private ticketRepo = new TicketRepository();
  private claimRepo = new TaskClaimRepository();
  private configRepo = new BotConfigRepository();
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  private async getTaskModRole(guild: Guild, guildId: string): Promise<Role> {
    const botConfig = await this.configRepo.get(guildId);
    
    // Check if role exists in config
    if (botConfig?.taskModRoleId) {
      const existingRole = guild.roles.cache.get(botConfig.taskModRoleId);
      if (existingRole) return existingRole;
    }

    // Check if role exists by name
    const existingRole = guild.roles.cache.find(r => r.name === 'task-mod');
    if (existingRole) {
      await this.configRepo.upsert(guildId, { taskModRoleId: existingRole.id });
      return existingRole;
    }

    // Create the role
    const newRole = await guild.roles.create({
      name: 'task-mod',
      color: 0x0099ff,
      reason: 'Task-buddy: Auto-created task moderator role',
    });
    
    await this.configRepo.upsert(guildId, { taskModRoleId: newRole.id });
    return newRole;
  }

  private async getOrCreateTaskCategory(guild: Guild, taskModRole: Role, guildId: string): Promise<any> {
    const botConfig = await this.configRepo.get(guildId);
    
    // Check if category exists in config
    if (botConfig?.taskCategoryId) {
      const existingCategory = guild.channels.cache.get(botConfig.taskCategoryId);
      if (existingCategory) return existingCategory;
    }

    // Check if category exists by name
    const existingCategory = guild.channels.cache.find(c => c.name === 'Task-buddy' && c.type === ChannelType.GuildCategory);
    if (existingCategory) {
      await this.configRepo.upsert(guildId, { taskCategoryId: existingCategory.id });
      return existingCategory;
    }

    // Create the category
    const newCategory = await guild.channels.create({
      name: 'Task-buddy',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: taskModRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });
    
    await this.configRepo.upsert(guildId, { taskCategoryId: newCategory.id });
    return newCategory;
  }

  async createTicket(claimId: string, member: User, guild: Guild, guildId: string): Promise<TextChannel> {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw new Error('Claim not found');
    }

    // Get or create task-mod role
    const taskModRole = await this.getTaskModRole(guild, guildId);
    
    // Get or create task category
    const category = await this.getOrCreateTaskCategory(guild, taskModRole, guildId);

    const channelName = `task-${member.username}-${claim.id.slice(-4)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
          type: OverwriteType.Member,
        },
        {
          id: taskModRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages],
          type: OverwriteType.Role,
        },
        {
          id: this.client.user!.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels],
          type: OverwriteType.Member,
        },
      ],
    });

    await this.ticketRepo.create(claimId, channel.id);

    return channel;
  }

  async closeTicket(claimId: string, closedBy: string) {
    const ticket = await this.ticketRepo.findByClaimId(claimId);
    if (!ticket || ticket.isClosed) {
      return;
    }

    const channel = this.client.channels.cache.get(ticket.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send('🔒 This ticket has been closed.');
      setTimeout(async () => {
        try {
          await channel.delete('Task completed/closed');
        } catch (e) {
          console.error('Failed to delete ticket channel:', e);
        }
      }, 5000);
    }

    await this.ticketRepo.close(claimId, closedBy);
  }

  async getTicketByChannelId(channelId: string) {
    return this.ticketRepo.findByChannelId(channelId);
  }
}