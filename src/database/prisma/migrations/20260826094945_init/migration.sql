-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('COMMENT', 'POST', 'UPVOTE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('AVAILABLE', 'CLAIMED', 'IN_PROGRESS', 'PROOF_SUBMITTED', 'COMPLETED', 'REJECTED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "discord_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "discriminator" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("discord_id")
);

-- CreateTable
CREATE TABLE "reddit_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "karma" INTEGER NOT NULL DEFAULT 0,
    "accountAge" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reddit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "taskCount" INTEGER NOT NULL,
    "payPerTask" DECIMAL(10,2) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "announcement_id" TEXT,
    "announcement_channel_id" TEXT,
    "minKarma" INTEGER NOT NULL DEFAULT 100,
    "minAccountAge" INTEGER NOT NULL DEFAULT 30,
    "created_by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "reddit_link" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assigned_to" TEXT,
    "claimed_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reddit_account_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'CLAIMED',
    "payAmount" DECIMAL(10,2) NOT NULL,
    "proof_url" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_statistics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "timedOut" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "announcement_channel_id" TEXT,
    "task_mod_role_id" TEXT,
    "task_category_id" TEXT,
    "min_karma" INTEGER NOT NULL DEFAULT 100,
    "min_account_age" INTEGER NOT NULL DEFAULT 30,
    "task_deadline_minutes" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reddit_accounts_user_id_key" ON "reddit_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_batches_announcement_id_key" ON "task_batches"("announcement_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_assigned_to_key" ON "tasks"("assigned_to");

-- CreateIndex
CREATE INDEX "tasks_batch_id_status_idx" ON "tasks"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_claims_task_id_key" ON "task_claims"("task_id");

-- CreateIndex
CREATE INDEX "task_claims_user_id_status_idx" ON "task_claims"("user_id", "status");

-- CreateIndex
CREATE INDEX "task_claims_batch_id_status_idx" ON "task_claims"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_claim_id_key" ON "tickets"("claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_channel_id_key" ON "tickets"("channel_id");

-- CreateIndex
CREATE INDEX "task_events_claim_id_createdAt_idx" ON "task_events"("claim_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_statistics_user_id_key" ON "user_statistics"("user_id");

-- AddForeignKey
ALTER TABLE "reddit_accounts" ADD CONSTRAINT "reddit_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("discord_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "task_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_claims" ADD CONSTRAINT "task_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("discord_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_claims" ADD CONSTRAINT "task_claims_reddit_account_id_fkey" FOREIGN KEY ("reddit_account_id") REFERENCES "reddit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_claims" ADD CONSTRAINT "task_claims_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_claims" ADD CONSTRAINT "task_claims_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "task_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "task_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "task_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_statistics" ADD CONSTRAINT "user_statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("discord_id") ON DELETE CASCADE ON UPDATE CASCADE;
