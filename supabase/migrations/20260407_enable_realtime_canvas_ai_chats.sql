-- Enable Supabase Realtime for canvas_ai_chats table
-- Required for live collaboration: multiple users see AI messages in real time
ALTER PUBLICATION supabase_realtime ADD TABLE canvas_ai_chats;

-- Set replica identity to full so UPDATE payloads include all columns
ALTER TABLE canvas_ai_chats REPLICA IDENTITY FULL;
