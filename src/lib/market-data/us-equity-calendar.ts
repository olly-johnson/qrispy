export type UsEquityCalendarDate = {
  day: number;
  month: number;
  year: number;
};

export function isUsEquityTradingDay(date: UsEquityCalendarDate) {
  return isWeekday(date) && !isUsEquityMarketHoliday(date);
}

function isUsEquityMarketHoliday(date: UsEquityCalendarDate) {
  return (
    isFixedHolidayObserved(date, 1, 1) ||
    isNthWeekdayOfMonth(date, 1, 1, 3) ||
    isNthWeekdayOfMonth(date, 2, 1, 3) ||
    isSameDate(date, addDays(easterSunday(date.year), -2)) ||
    isLastWeekdayOfMonth(date, 5, 1) ||
    isFixedHolidayObserved(date, 6, 19) ||
    isFixedHolidayObserved(date, 7, 4) ||
    isNthWeekdayOfMonth(date, 9, 1, 1) ||
    isNthWeekdayOfMonth(date, 11, 4, 4) ||
    isFixedHolidayObserved(date, 12, 25)
  );
}

function isFixedHolidayObserved(
  date: UsEquityCalendarDate,
  month: number,
  day: number,
) {
  return [date.year - 1, date.year, date.year + 1].some((year) =>
    isSameDate(date, observedFixedHoliday(year, month, day)),
  );
}

function observedFixedHoliday(year: number, month: number, day: number) {
  const holiday = { day, month, year };
  const dayOfWeek = dayOfWeekFor(holiday);

  if (dayOfWeek === 6) {
    return addDays(holiday, -1);
  }
  if (dayOfWeek === 0) {
    return addDays(holiday, 1);
  }

  return holiday;
}

function isNthWeekdayOfMonth(
  date: UsEquityCalendarDate,
  month: number,
  weekday: number,
  occurrence: number,
) {
  if (date.month !== month || dayOfWeekFor(date) !== weekday) {
    return false;
  }

  return Math.floor((date.day - 1) / 7) + 1 === occurrence;
}

function isLastWeekdayOfMonth(
  date: UsEquityCalendarDate,
  month: number,
  weekday: number,
) {
  if (date.month !== month || dayOfWeekFor(date) !== weekday) {
    return false;
  }

  return addDays(date, 7).month !== month;
}

function easterSunday(year: number): UsEquityCalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);

  return {
    day: ((h + l - 7 * m + 114) % 31) + 1,
    month: Math.floor((h + l - 7 * m + 114) / 31),
    year,
  };
}

function addDays(date: UsEquityCalendarDate, days: number): UsEquityCalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));

  return {
    day: value.getUTCDate(),
    month: value.getUTCMonth() + 1,
    year: value.getUTCFullYear(),
  };
}

function isSameDate(left: UsEquityCalendarDate, right: UsEquityCalendarDate) {
  return left.day === right.day && left.month === right.month && left.year === right.year;
}

function isWeekday(date: UsEquityCalendarDate) {
  const dayOfWeek = dayOfWeekFor(date);

  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function dayOfWeekFor(date: UsEquityCalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).getUTCDay();
}
