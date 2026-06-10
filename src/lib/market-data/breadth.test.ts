import { describe, expect, it } from "vitest";

import {
  buildDashboardBreadthSnapshot,
  buildMarketBreadthSnapshot,
  fetchStockbeeMarketMonitorWorkbookRows,
  parseStockbeeMarketMonitorSheets,
  parseStockbeeMarketMonitorCsv,
  summarizeMarketIndexBars,
  t2108Color,
} from "./breadth";
import type { OhlcvBar } from "./types";

const STOCKBEE_CSV = `,Primary Breadth Indicators,,,,,,,,,,,,,,\nDate,Number of stocks up 4% plus today,Number of stocks down 4% plus today,5 day ratio,10 day  ratio ,Number of stocks up 25% plus in a quarter,Number of stocks down 25% + in a quarter,Number of stocks up 25% + in a month,Number of stocks down 25% + in a month,Number of stocks up 50% + in a month,Number of stocks down 50% + in a month,Number of stocks up 13% + in 34 days,Number of stocks down 13% + in 34 days, Worden Common stock universe,T2108 ,S&P\n6/3/2026,154,441,1.29,1.90,1469,967,215,156,65,30,1581,1649,6462,39.31,"7,553.68"\n6/2/2026,295,301,1.79,2.08,1582,903,284,137,94,30,1805,1460,6459,45.31,"7,609.78"\n`;

describe("parseStockbeeMarketMonitorCsv", () => {
  it("normalizes dated Stockbee rows and quoted market values", () => {
    expect(parseStockbeeMarketMonitorCsv(STOCKBEE_CSV)).toEqual([
      expect.objectContaining({
        date: "2026-06-03",
        up4Percent: 154,
        down4Percent: 441,
        ratio5Day: 1.29,
        ratio10Day: 1.9,
        up25Quarter: 1469,
        down25Quarter: 967,
        up13In34Days: 1581,
        down13In34Days: 1649,
        universeCount: 6462,
        t2108: 39.31,
        sp500: 7553.68,
      }),
      expect.objectContaining({
        date: "2026-06-02",
        sp500: 7609.78,
      }),
    ]);
  });

  it("maps legacy 2013 headers by name and repairs sheet-year typos", () => {
    const csv = `Primary Indicators,,,,,,,,,,,Secondary Indicators,,,,,,,,,\nDate,4% plus daily,4% down daily,5 day breadth ratio,10 day breadth ratio,Bottom Day,TNA Vbbee buy/sale,25% plus  quarter,25% down quarter,Primary Breadth Ratio,,25% plus month,25% down month,50% plus month,50% down month,34/13 bull,34/13 bear,Common Stocks,T2108,c>avgc5 ,c<avgc5\n5/20/0213,186,43,2.18,1.89,,,878,216,4.06,,201,18,29,2,1686,328,5786,74,,\n`;

    expect(parseStockbeeMarketMonitorCsv(csv, { fallbackYear: 2013 })).toEqual([
      expect.objectContaining({
        date: "2013-05-20",
        down13In34Days: 328,
        down25Month: 18,
        down25Quarter: 216,
        down4Percent: 43,
        down50Month: 2,
        ratio10Day: 1.89,
        ratio5Day: 2.18,
        t2108: 74,
        universeCount: 5786,
        up13In34Days: 1686,
        up25Month: 201,
        up25Quarter: 878,
        up4Percent: 186,
        up50Month: 29,
      }),
    ]);
  });

  it("uses the sheet year for old reformatted rows without a year", () => {
    const csv = `Date,# of Stocks Up >4%  on high volume,# of stocks down >4%  on high volume,Oscillator % ratio,Primary Indicator,# of stocks up >25% in a quarter,# of stocks down >25% in a quarter,Oscillator % ratio,Secondary Indicators,# of stocks up >50% in a month,# of stocks down >50% in a month,,# of stocks up >25% in a month,# of stocks down >25% in a month,,# of stocks up >100% in a year,# of stocks up >200% in a year,,MM 34/13 +,MM 34/13 -,,,# of stocks in Worden Database\n12/31,952,92,,,2849,2415,,,74,11,,533,68,,304,54,,3780,1202,,,6172\n`;

    expect(parseStockbeeMarketMonitorCsv(csv, { fallbackYear: 2008 })).toEqual([
      expect.objectContaining({
        date: "2008-12-31",
        down13In34Days: 1202,
        down25Month: 68,
        down25Quarter: 2415,
        down4Percent: 92,
        down50Month: 11,
        universeCount: 6172,
        up13In34Days: 3780,
        up25Month: 533,
        up25Quarter: 2849,
        up4Percent: 952,
        up50Month: 74,
      }),
    ]);
  });
});

describe("parseStockbeeMarketMonitorSheets", () => {
  it("finds year sheets, skips chart tabs, and prefers reformatted old years", () => {
    const html = [
      'items.push({name: "2026", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1082103394", gid: "1082103394",initialSheet: ("1082103394" == gid)});',
      'items.push({name: "Chart 2026", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=558544032", gid: "558544032",initialSheet: ("558544032" == gid)});',
      'items.push({name: "2008", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1269494253", gid: "1269494253",initialSheet: ("1269494253" == gid)});',
      'items.push({name: "Copy of 2008 reformatted", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1770823350", gid: "1770823350",initialSheet: ("1770823350" == gid)});',
      'items.push({name: "Copy of 2007 reformatted", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=269978205", gid: "269978205",initialSheet: ("269978205" == gid)});',
    ].join("");

    expect(parseStockbeeMarketMonitorSheets(html)).toEqual([
      {
        csvUrl:
          "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/pub?gid=1082103394&single=true&output=csv",
        gid: "1082103394",
        name: "2026",
        year: 2026,
      },
      {
        csvUrl:
          "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/pub?gid=1770823350&single=true&output=csv",
        gid: "1770823350",
        name: "Copy of 2008 reformatted",
        year: 2008,
      },
      {
        csvUrl:
          "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/pub?gid=269978205&single=true&output=csv",
        gid: "269978205",
        name: "Copy of 2007 reformatted",
        year: 2007,
      },
    ]);
  });
});

describe("fetchStockbeeMarketMonitorWorkbookRows", () => {
  it("keeps the richer row when adjacent year sheets contain the same date", async () => {
    const sheet2014Url =
      "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/pub?gid=1622090416&single=true&output=csv";
    const sheet2013Url =
      "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/pub?gid=299051502&single=true&output=csv";
    const fetcher = async (url: string) => {
      if (url === "https://example.test/workbook") {
        return stockbeeResponse(
          [
            'items.push({name: "2014", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1622090416", gid: "1622090416",initialSheet: ("1622090416" == gid)});',
            'items.push({name: "2013", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=299051502", gid: "299051502",initialSheet: ("299051502" == gid)});',
          ].join(""),
        );
      }
      if (url === sheet2014Url) {
        return stockbeeResponse(
          "Date,4% plus daily,4% down daily\n12/31/2013,99,33\n",
        );
      }
      if (url === sheet2013Url) {
        return stockbeeResponse(
          "Date,4% plus daily,4% down daily,5 day breadth ratio,10 day breadth ratio,Bottom Day,TNA Vbbee buy/sale,25% plus  quarter,25% down quarter,Primary Breadth Ratio,,25% plus month,25% down month,50% plus month,50% down month,34/13 bull,34/13 bear,Common Stocks,T2108\n12/31/2013,99,33,2.72,3.21,,,928,274,3.39,,93,13,24,1,1208,355,5821,62.67\n",
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    };

    await expect(
      fetchStockbeeMarketMonitorWorkbookRows({
        fetcher,
        workbookUrl: "https://example.test/workbook",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        date: "2013-12-31",
        ratio5Day: 2.72,
        up25Quarter: 928,
        up13In34Days: 1208,
        t2108: 62.67,
      }),
    ]);
  });
});

describe("buildMarketBreadthSnapshot", () => {
  it("keeps the latest row first for the table and oldest first for charts", () => {
    const snapshot = buildMarketBreadthSnapshot(
      parseStockbeeMarketMonitorCsv(STOCKBEE_CSV),
    );

    expect(snapshot.latest?.date).toBe("2026-06-03");
    expect(snapshot.tableRows.map((row) => row.date)).toEqual([
      "2026-06-03",
      "2026-06-02",
    ]);
    expect(snapshot.chartRows.map((row) => row.date)).toEqual([
      "2026-06-02",
      "2026-06-03",
    ]);
  });
});

describe("summarizeMarketIndexBars", () => {
  it("compares the latest close with key moving averages", () => {
    const bars = Array.from({ length: 220 }, (_, index) =>
      bar({
        close: index < 200 ? 100 : index === 219 ? 131 : 130,
        day: index + 1,
        symbol: "SPY",
      }),
    );

    const summary = summarizeMarketIndexBars("SPY", bars);

    expect(summary).toEqual(
      expect.objectContaining({
        symbol: "SPY",
        price: 131,
        priceAboveSma10: true,
        priceAboveSma20: true,
        sma10AboveSma20: true,
        sma50AboveSma200: true,
      }),
    );
  });
});

describe("buildDashboardBreadthSnapshot", () => {
  it("extracts latest 13/34, T2108, and SPY/QQQ short-term trend status", () => {
    const snapshot = buildDashboardBreadthSnapshot(
      buildMarketBreadthSnapshot(parseStockbeeMarketMonitorCsv(STOCKBEE_CSV)),
      [
        {
          symbol: "SPY",
          price: 754.24,
          priceAboveSma10: true,
          priceAboveSma20: true,
          sma10AboveSma20: true,
          sma50AboveSma200: true,
        },
        {
          symbol: "QQQ",
          price: 744.21,
          priceAboveSma10: false,
          priceAboveSma20: true,
          sma10AboveSma20: false,
          sma50AboveSma200: true,
        },
        {
          symbol: "IWM",
          price: 287.67,
          priceAboveSma10: false,
          priceAboveSma20: true,
          sma10AboveSma20: true,
          sma50AboveSma200: true,
        },
      ],
    );

    expect(snapshot).toEqual({
      date: "2026-06-03",
      up4Percent: 154,
      down4Percent: 441,
      fourPercentBias: "down",
      up13In34Days: 1581,
      down13In34Days: 1649,
      thirteenThirtyFourBias: "down",
      t2108: 39.31,
      indexes: [
        {
          symbol: "SPY",
          priceAboveSma10: true,
          priceAboveSma20: true,
          sma10AboveSma20: true,
        },
        {
          symbol: "QQQ",
          priceAboveSma10: false,
          priceAboveSma20: true,
          sma10AboveSma20: false,
        },
      ],
    });
  });
});

describe("t2108Color", () => {
  it("moves from green to yellow/orange to red as T2108 rises", () => {
    expect(t2108Color(10)).toBe("#22c55e");
    expect(t2108Color(50)).toBe("#eab308");
    expect(t2108Color(70)).toBe("#f97316");
    expect(t2108Color(90)).toBe("#ef4444");
  });
});

function bar(input: {
  symbol: string;
  close: number;
  day: number;
}): OhlcvBar {
  const date = new Date(Date.UTC(2026, 0, input.day));

  return {
    adjusted: true,
    barStartAt: date.toISOString(),
    close: input.close,
    high: input.close + 1,
    low: input.close - 1,
    open: input.close,
    provider: "test",
    rawPayload: {},
    symbol: input.symbol,
    timeframe: "1d",
    volume: 1_000_000,
  };
}

function stockbeeResponse(text: string) {
  return {
    ok: true,
    status: 200,
    text: async () => text,
  };
}
