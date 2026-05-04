-- Enable Realtime on assistant_messages so CompanionDrawer can subscribe to
-- FSM-inserted messages without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE assistant_messages;
