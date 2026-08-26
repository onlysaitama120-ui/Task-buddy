import { GuildMember, Role } from 'discord.js';
import { getOwnerUserId } from '../config';
import { AuthorizedGuildRepository } from '../database/repositories';

const authorizedGuildRepo = new AuthorizedGuildRepository();

export function isOwner(userId: string): boolean {
  return userId === getOwnerUserId();
}

export function requireOwner(userId: string): void {
  if (!isOwner(userId)) {
    throw new Error('Only the bot owner can use this command.');
  }
}

export function isTaskMod(member: GuildMember): boolean {
  return member.roles.cache.some(role => role.name === 'task-mod');
}

export function requireTaskMod(member: GuildMember): void {
  if (!isTaskMod(member)) {
    throw new Error('You must have the task-mod role to use this command.');
  }
}

export function getTaskModRole(guild: { roles: { cache: Map<string, Role> } }): Role | undefined {
  for (const role of guild.roles.cache.values()) {
    if (role.name === 'task-mod') return role;
  }
  return undefined;
}

export async function requireAuthorizedGuild(guildId: string): Promise<void> {
  const authorized = await authorizedGuildRepo.isAuthorized(guildId);
  if (!authorized) {
    throw new Error('This server is not authorized to use Task-buddy. Contact the bot owner to authorize it.');
  }
}