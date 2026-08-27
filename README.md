# Task‑Buddy Bot

A Discord bot that lets members earn virtual credits by completing Reddit‑based micro‑tasks (comment, post, up‑vote, or custom).  The bot includes:

- **Reddit verification via a button → modal** (users paste their Reddit profile URL).
- **Atomic task claiming** (transaction‑safe, no duplicate claims).
- **Automatic timeout worker** that moves overdue claims to `TIMED_OUT`.
- **Full TypeScript codebase** using Prisma + PostgreSQL.
- **Dockerfile** ready for Render (or any container platform).

## Quick Start (Render)
1. **Fork / clone** this repo.
2. **Create a `.env`** (copy from `.env.example`) with your Discord token, client ID, and the Render‑provided Postgres `DATABASE_URL`.
3. **Push to GitHub** and create a Render *Web Service* (Docker).  The Dockerfile builds the image and runs `node dist/index.js`.
4. **Invite the bot** to your server using the OAuth URL:
   ```
   https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot%20applications.commands&permissions=274877906944
   ```
5. In Discord, use the **Verify** button (or the `/dash_verify` command) to link a Reddit account.
6. Admins can create task batches via the `/dash_createbatch` command (or the UI – not included in this minimal build).

## Architecture
- **Discord client** (`src/index.ts`) – boots the bot, registers the verification interaction, and starts the timeout worker.
- **Service layer** (`src/services/*`) – pure business logic (no Discord API calls).
- **Repositories** (`src/database/repositories/*`) – thin Prisma wrappers.
- **Prisma schema** (`src/database/prisma/schema.prisma`).
- **Verification modal** (`src/discord/verificationModal.ts`).
- **Timeout worker** (`src/services/taskTimeoutService.ts` + `src/cron/timeoutCron.ts`).

## Extending the Bot
- Add more slash‑commands in `src/index.ts` or separate modules.
- Implement real Reddit API calls in `verificationModal.ts` (replace placeholder karma/account‑age).
- Add a leaderboard command using `UserStatistics`.
- Hook the timeout worker into a dedicated Render *Background Worker* if you prefer separation.

---
*All original functionality is preserved; only the broken verification flow and race‑condition‑prone claim logic were fixed.*
