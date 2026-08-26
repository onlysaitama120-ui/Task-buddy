import { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import { TaskType, BatchStatus, TaskStatus } from '@prisma/client';

export function createBatchAnnouncementEmbed(batch: {
  id: string;
  name: string;
  type: TaskType;
  taskCount: number;
  payPerTask: number;
  minKarma: number;
  minAccountAge: number;
  availableCount: number;
}) {
  const typeEmoji = getTypeEmoji(batch.type);
  const typeName = batch.type.charAt(0) + batch.type.slice(1).toLowerCase();

  const embed = new EmbedBuilder()
    .setTitle('📣 NEW TASKS')
    .setColor(Colors.Green)
    .addFields(
      { name: '🏅 Task Type', value: `${typeEmoji} ${typeName}`, inline: true },
      { name: '👥 Taskers Needed', value: `${batch.availableCount} / ${batch.taskCount}`, inline: true },
      { name: '💰 Pay', value: `$${batch.payPerTask.toFixed(2)} / task`, inline: true },
      { name: '📋 Requirements', value: `Min Karma: ${batch.minKarma}
Min Account Age: ${batch.minAccountAge} days`, inline: true }
    )
    .setFooter({ text: 'Click the button below to claim a task' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId(`claim_task:${batch.id}`)
    .setLabel('✅ Claim Task')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embed, components: [row] };
}

export function createTaskTicketEmbed(task: {
  comment: string;
  redditLink: string;
  type: TaskType;
  payAmount: number;
  redditUsername: string;
  dueAt: Date;
}) {
  const typeName = task.type.charAt(0) + task.type.slice(1).toLowerCase();

  const embed = new EmbedBuilder()
    .setTitle(`📋 Task Assigned: ${typeName}`)
    .setColor(Colors.Blue)
    .addFields(
      { name: '👤 Assigned Account', value: `u/${task.redditUsername}`, inline: true },
      { name: '💰 Payment', value: `$${task.payAmount.toFixed(2)}`, inline: true },
      { name: '⏰ Deadline', value: `<t:${Math.floor(task.dueAt.getTime() / 1000)}:R>`, inline: true },
      { name: '📝 Comment', value: task.comment, inline: false },
      { name: '🔗 Reddit Link', value: task.redditLink, inline: false },
      { name: '⚠️ Disclaimer', value: '**Disclaimer:** Do not click the link. Search the post by keyword, scroll to find it, join the subreddit, and type the comment manually — do not paste.', inline: false }
    )
    .setTimestamp();

  return embed;
}

export function createTaskStatsEmbed(member: { user: { username: string; displayAvatarURL: () => string } }, stats: {
  completed: number;
  rejected: number;
  timedOut: number;
  totalEarned: number;
}) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Task Statistics')
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(Colors.Gold)
    .addFields(
      { name: 'Member', value: member.user.username, inline: true },
      { name: '✅ Completed', value: stats.completed.toString(), inline: true },
      { name: '❌ Rejected', value: stats.rejected.toString(), inline: true },
      { name: '⏰ Timed Out', value: stats.timedOut.toString(), inline: true },
      { name: '💰 Total Earned', value: `$${stats.totalEarned.toFixed(2)}`, inline: true }
    )
    .setTimestamp();

  return embed;
}

export function createVerificationStatusEmbed(status: {
  registered: boolean;
  verified: boolean;
  username?: string;
  karma?: number;
  accountAge?: number;
  requiredKarma: number;
  requiredAccountAge: number;
}) {
  if (!status.registered) {
    return new EmbedBuilder()
      .setTitle('🔍 Reddit Account Status')
      .setColor(Colors.Red)
      .setDescription('No Reddit account registered. Use `/register` to add your Reddit account.')
      .setTimestamp();
  }

  const embed = new EmbedBuilder()
    .setTitle('🔍 Reddit Account Status')
    .setColor(status.verified ? Colors.Green : Colors.Yellow)
    .addFields(
      { name: 'Username', value: `u/${status.username}`, inline: true },
      { name: 'Karma', value: `${status.karma} / ${status.requiredKarma}`, inline: true },
      { name: 'Account Age', value: `${status.accountAge} / ${status.requiredAccountAge} days`, inline: true },
      { name: 'Status', value: status.verified ? '✅ Verified' : '❌ Not Verified', inline: true }
    )
    .setTimestamp();

  return embed;
}

export function createBatchListEmbed(batches: Array<{
  id: string;
  name: string;
  type: TaskType;
  taskCount: number;
  payPerTask: number;
  status: BatchStatus;
  availableCount: number;
}>) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Task Batches')
    .setColor(Colors.Blue)
    .setTimestamp();

  if (batches.length === 0) {
    embed.setDescription('No batches found.');
    return embed;
  }

  for (const batch of batches) {
    const typeEmoji = getTypeEmoji(batch.type);
    const statusEmoji = batch.status === BatchStatus.ACTIVE ? '🟢' : batch.status === BatchStatus.COMPLETED ? '✅' : '🔴';
    embed.addFields({
      name: `${statusEmoji} ${batch.name} (${batch.id.slice(0, 8)})`,
      value: `${typeEmoji} ${batch.type} | ${batch.availableCount}/${batch.taskCount} available | $${batch.payPerTask.toFixed(2)}/task`,
      inline: false,
    });
  }

  return embed;
}

function getTypeEmoji(type: TaskType): string {
  switch (type) {
    case TaskType.COMMENT: return '💬';
    case TaskType.POST: return '📝';
    case TaskType.UPVOTE: return '👍';
    case TaskType.CUSTOM: return '⚙️';
    default: return '📋';
  }
}

export function formatTaskStatus(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.AVAILABLE: return '🟢 Available';
    case TaskStatus.CLAIMED: return '🔵 Claimed';
    case TaskStatus.IN_PROGRESS: return '🟡 In Progress';
    case TaskStatus.PROOF_SUBMITTED: return '🟠 Proof Submitted';
    case TaskStatus.COMPLETED: return '✅ Completed';
    case TaskStatus.REJECTED: return '❌ Rejected';
    case TaskStatus.TIMED_OUT: return '⏰ Timed Out';
    default: return status;
  }
}
