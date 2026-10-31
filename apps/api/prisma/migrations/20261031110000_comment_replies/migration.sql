-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "comments_parent_id_created_at_idx" ON "comments"("parent_id", "created_at");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notificación nueva "reply" (S4-14): alguien respondió tu comentario
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('like', 'comment', 'follow', 'message', 'reply'));
