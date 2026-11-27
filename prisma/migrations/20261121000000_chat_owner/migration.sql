-- Chats were global: any member could read, append to or delete anyone's (audit INV-2).
-- Existing rows keep a NULL owner; only admins can see them.
ALTER TABLE "Chat" ADD COLUMN "userId" TEXT;
CREATE INDEX "Chat_userId_idx" ON "Chat"("userId");
