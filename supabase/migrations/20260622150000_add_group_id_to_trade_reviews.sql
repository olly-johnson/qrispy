-- Allow a review to attach to a trade_review_group (a campaign) as well as a single trade.
alter table public.trade_reviews
  alter column trade_id drop not null;

alter table public.trade_reviews
  add column group_id uuid;

-- Composite FK so a review's group must belong to the same owner (mirrors trade_review_group_members).
alter table public.trade_reviews
  add constraint trade_reviews_group_fk
  foreign key (group_id, user_id)
  references public.trade_review_groups (id, user_id) on delete cascade;

-- Exactly one target: a review is for a single trade OR a group, never both/neither.
alter table public.trade_reviews
  add constraint trade_reviews_one_target
  check ((trade_id is not null) <> (group_id is not null));

-- One review per group (the existing unique (trade_id) already covers single trades; nulls don't collide).
create unique index trade_reviews_group_id_key
  on public.trade_reviews (group_id);
