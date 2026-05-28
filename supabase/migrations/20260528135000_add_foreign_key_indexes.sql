create index account_equity_snapshots_user_id_idx
  on public.account_equity_snapshots (user_id);

create index account_portfolio_snapshots_user_id_idx
  on public.account_portfolio_snapshots (user_id);

create index fills_account_id_idx
  on public.fills (account_id);

create index fills_import_batch_id_idx
  on public.fills (import_batch_id);

create index job_steps_job_run_id_idx
  on public.job_steps (job_run_id);

create index job_steps_user_id_idx
  on public.job_steps (user_id);

create index sync_cursors_account_id_idx
  on public.sync_cursors (account_id);

create index trade_fills_fill_id_idx
  on public.trade_fills (fill_id);

create index trade_fills_user_id_idx
  on public.trade_fills (user_id);

create index trades_account_id_idx
  on public.trades (account_id);
