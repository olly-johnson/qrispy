import type { IndicatorPoint } from "./types";

type ClosePoint = {
  time: string;
  close: number;
};

export function sma(points: ClosePoint[], period: number): IndicatorPoint[] {
  const values: IndicatorPoint[] = [];
  let sum = 0;

  for (let index = 0; index < points.length; index += 1) {
    sum += points[index].close;

    if (index >= period) {
      sum -= points[index - period].close;
    }

    if (index >= period - 1) {
      values.push({
        time: points[index].time,
        value: roundIndicator(sum / period),
      });
    }
  }

  return values;
}

export function ema(points: ClosePoint[], period: number): IndicatorPoint[] {
  if (points.length < period) {
    return [];
  }

  const values: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);
  let previous =
    points.slice(0, period).reduce((sum, point) => sum + point.close, 0) / period;

  values.push({
    time: points[period - 1].time,
    value: roundIndicator(previous),
  });

  for (let index = period; index < points.length; index += 1) {
    previous = (points[index].close - previous) * multiplier + previous;
    values.push({
      time: points[index].time,
      value: roundIndicator(previous),
    });
  }

  return values;
}

function roundIndicator(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
