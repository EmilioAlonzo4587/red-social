-- AlterTable
ALTER TABLE "post_likes" ADD COLUMN     "reaction" VARCHAR(10) NOT NULL DEFAULT 'like';

-- Los likes que ya existen quedan como Me gusta por el DEFAULT
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_reaction_check" CHECK ("reaction" IN ('like', 'love', 'haha', 'wow', 'sad', 'angry'));
