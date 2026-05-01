-- Enable Supabase Realtime for canvas_states table
-- Required for live collaboration: tab B reloads full canvas when tab A saves
ALTER PUBLICATION supabase_realtime ADD TABLE canvas_states;

-- Set replica identity to full so UPDATE payloads include all columns (nodes, edges, draw_paths)
ALTER TABLE canvas_states REPLICA IDENTITY FULL;
