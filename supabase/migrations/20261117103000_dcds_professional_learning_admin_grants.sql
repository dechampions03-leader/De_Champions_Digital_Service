-- Complete administrator table privileges for the learning-path and workshop managers.
-- Row-level security policies continue to restrict all write access to registered DCDS administrators.
grant select,insert,update,delete on public.dcds_learning_paths to authenticated;
grant select,insert,update,delete on public.dcds_workshops to authenticated;
