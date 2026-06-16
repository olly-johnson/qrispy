drop function if exists public.calculate_cached_breadth_metrics(
  text[],
  date,
  integer,
  integer
);

create or replace function public.calculate_cached_breadth_metrics(
  symbols text[],
  as_of_date date,
  today_up4 integer,
  today_down4 integer
)
returns table (
  history_end_date date,
  is_stale boolean,
  t2108 numeric,
  t2108_covered integer,
  up_13_in_34_days integer,
  down_13_in_34_days integer,
  ratio_5_day numeric,
  ratio_10_day numeric
)
language sql
stable
set search_path = ''
as $$
  with requested_symbols as (
    select distinct upper(symbol) as symbol
    from unnest(symbols) as symbol
    where nullif(trim(symbol), '') is not null
  ),
  raw_bars as (
    select
      b.symbol,
      b.bar_start_at::date as trade_date,
      b.close::numeric as close
    from public.ohlcv_bars b
    join requested_symbols rs on rs.symbol = b.symbol
    where b.provider = 'massive'
      and b.timeframe = '1d'
      and b.adjusted = true
      and b.bar_start_at >= ((as_of_date - interval '75 days')::date)::timestamptz
      and b.bar_start_at < ((as_of_date + interval '1 day')::date)::timestamptz
      and b.close > 0
  ),
  history_bounds as (
    select
      max(trade_date) as history_end_date,
      (as_of_date - interval '4 days')::date as minimum_fresh_date
    from raw_bars
  ),
  freshness as (
    select
      history_end_date,
      minimum_fresh_date,
      history_end_date is null or history_end_date < minimum_fresh_date as is_stale
    from history_bounds
  ),
  bars as (
    select
      rb.symbol,
      rb.trade_date,
      rb.close,
      lag(rb.close) over (
        partition by rb.symbol
        order by rb.trade_date
      ) as previous_close,
      row_number() over (
        partition by rb.symbol
        order by rb.trade_date desc
      ) as recent_rank
    from raw_bars rb
  ),
  symbol_metrics as (
    select
      symbol,
      max(trade_date) as latest_symbol_date,
      max(close) filter (where recent_rank = 1) as latest_close,
      avg(close) filter (where recent_rank <= 40) as sma40,
      count(*) filter (where recent_rank <= 40) as sma40_count,
      max(close) filter (where recent_rank = 35) as anchor34_close
    from bars
    group by symbol
  ),
  daily_counts as (
    select
      trade_date,
      count(*) filter (
        where previous_close > 0
          and ((close - previous_close) / previous_close) * 100 >= 4
      )::integer as up4,
      count(*) filter (
        where previous_close > 0
          and ((close - previous_close) / previous_close) * 100 <= -4
      )::integer as down4
    from bars
    where previous_close is not null
    group by trade_date
  ),
  counts_with_today as (
    select trade_date, up4, down4
    from daily_counts
    where trade_date < as_of_date
    union all
    select as_of_date, greatest(today_up4, 0), greatest(today_down4, 0)
  ),
  tail5 as (
    select up4, down4
    from counts_with_today
    order by trade_date desc
    limit 5
  ),
  tail10 as (
    select up4, down4
    from counts_with_today
    order by trade_date desc
    limit 10
  ),
  sums as (
    select
      coalesce((select sum(up4) from tail5), 0)::numeric as up5,
      coalesce((select sum(down4) from tail5), 0)::numeric as down5,
      coalesce((select count(*) from tail5), 0)::integer as count5,
      coalesce((select sum(up4) from tail10), 0)::numeric as up10,
      coalesce((select sum(down4) from tail10), 0)::numeric as down10,
      coalesce((select count(*) from tail10), 0)::integer as count10
  )
  select
    f.history_end_date,
    f.is_stale,
    case
      when f.is_stale then null
      when count(*) filter (
        where sm.latest_symbol_date = f.history_end_date
          and sm.sma40_count = 40
      ) = 0 then null
      else round(
        (
          count(*) filter (
            where sm.latest_symbol_date = f.history_end_date
              and sm.sma40_count = 40
              and sm.latest_close > sm.sma40
          )::numeric
          / count(*) filter (
            where sm.latest_symbol_date = f.history_end_date
              and sm.sma40_count = 40
          )::numeric
        ) * 100,
        2
      )
    end as t2108,
    case
      when f.is_stale then 0
      else count(*) filter (
        where sm.latest_symbol_date = f.history_end_date
          and sm.sma40_count = 40
      )::integer
    end as t2108_covered,
    case
      when f.is_stale then null
      else count(*) filter (
        where sm.latest_symbol_date = f.history_end_date
          and sm.anchor34_close > 0
          and ((sm.latest_close - sm.anchor34_close) / sm.anchor34_close) * 100 >= 13
      )::integer
    end as up_13_in_34_days,
    case
      when f.is_stale then null
      else count(*) filter (
        where sm.latest_symbol_date = f.history_end_date
          and sm.anchor34_close > 0
          and ((sm.latest_close - sm.anchor34_close) / sm.anchor34_close) * 100 <= -13
      )::integer
    end as down_13_in_34_days,
    case
      when f.is_stale or sums.count5 < 5 then null
      when sums.down5 = 0 and sums.up5 = 0 then null
      when sums.down5 = 0 then round(sums.up5, 2)
      else round(sums.up5 / sums.down5, 2)
    end as ratio_5_day,
    case
      when f.is_stale or sums.count10 < 10 then null
      when sums.down10 = 0 and sums.up10 = 0 then null
      when sums.down10 = 0 then round(sums.up10, 2)
      else round(sums.up10 / sums.down10, 2)
    end as ratio_10_day
  from freshness f
  left join symbol_metrics sm on true
  cross join sums
  group by
    f.history_end_date,
    f.is_stale,
    sums.up5,
    sums.down5,
    sums.count5,
    sums.up10,
    sums.down10,
    sums.count10;
$$;

grant execute on function public.calculate_cached_breadth_metrics(
  text[],
  date,
  integer,
  integer
) to authenticated, service_role;
