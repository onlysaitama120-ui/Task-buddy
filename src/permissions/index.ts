import { GuildMember, Role } from 'discord.js';

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