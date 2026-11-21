-- Chats were global: any member could read, append to or delete anyone's (audit INV-2).
-- Existing rows keep a NULL owner and are no longer listed to anyone.
ALTER TABLE "Chat" ADD COLUMN "userId" TEXT;
CREATE INDEX "Chat_userId_idx" ON "Chat"("userId");
