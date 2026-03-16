import type { StockData, FactorWeights, ScreenFilters } from "@shared/schema";

export interface IStorage {
  getStocks(region: string): StockData[];
  getAllStocks(): StockData[];
  setStocks(stocks: StockData[]): void;
  getLastUpdated(): string;
  setLastUpdated(date: string): void;
  getDataSource(): string;
  setDataSource(source: string): void;
}

export class MemStorage implements IStorage {
  private stocks: StockData[] = [];
  private lastUpdated: string = new Date().toISOString();
  private dataSource: string = "simulated";

  getStocks(region: string): StockData[] {
    if (region === "ALL") return this.stocks;
    return this.stocks.filter((s) => s.region === region);
  }

  getAllStocks(): StockData[] {
    return this.stocks;
  }

  setStocks(stocks: StockData[]): void {
    this.stocks = stocks;
  }

  getLastUpdated(): string {
    return this.lastUpdated;
  }

  setLastUpdated(date: string): void {
    this.lastUpdated = date;
  }

  getDataSource(): string {
    return this.dataSource;
  }

  setDataSource(source: string): void {
    this.dataSource = source;
  }
}

export const storage = new MemStorage();
