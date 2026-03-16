import type { StockData } from "@shared/schema";

// Helper to generate realistic random data
function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function nullable<T>(value: T, nullChance: number = 0.1): T | null {
  return Math.random() < nullChance ? null : value;
}

const US_STOCKS = [
  { ticker: "CMPO", name: "Composecure Inc", sector: "Technology", industry: "Software" },
  { ticker: "TATT", name: "TAT Technologies", sector: "Industrials", industry: "Aerospace" },
  { ticker: "CEVA", name: "CEVA Inc", sector: "Technology", industry: "Semiconductors" },
  { ticker: "UFPT", name: "UFP Technologies", sector: "Healthcare", industry: "Medical Devices" },
  { ticker: "PERI", name: "Perion Network", sector: "Communication Services", industry: "Advertising" },
  { ticker: "NVEC", name: "NVE Corporation", sector: "Technology", industry: "Semiconductors" },
  { ticker: "CRS", name: "Carpenter Technology", sector: "Materials", industry: "Specialty Metals" },
  { ticker: "AEHR", name: "Aehr Test Systems", sector: "Technology", industry: "Semiconductor Equipment" },
  { ticker: "SNEX", name: "StoneX Group", sector: "Industrials", industry: "Capital Markets" },
  { ticker: "IIPR", name: "Innovative Industrial", sector: "Real Estate", industry: "Specialty REIT" },
  { ticker: "IESC", name: "IES Holdings", sector: "Industrials", industry: "Engineering" },
  { ticker: "WRLD", name: "World Acceptance", sector: "Consumer Discretionary", industry: "Consumer Finance" },
  { ticker: "RCMT", name: "RCM Technologies", sector: "Industrials", industry: "Staffing" },
  { ticker: "ARHS", name: "Arhaus Inc", sector: "Consumer Discretionary", industry: "Furniture" },
  { ticker: "FWRD", name: "Forward Air Corp", sector: "Industrials", industry: "Trucking" },
  { ticker: "BBSI", name: "Barrett Business", sector: "Industrials", industry: "Staffing" },
  { ticker: "ASTE", name: "Astec Industries", sector: "Industrials", industry: "Farm Machinery" },
  { ticker: "MLAB", name: "Mesa Labs Inc", sector: "Healthcare", industry: "Medical Instruments" },
  { ticker: "JBSS", name: "John B Sanfilippo", sector: "Consumer Staples", industry: "Packaged Foods" },
  { ticker: "FRPH", name: "FRP Holdings", sector: "Real Estate", industry: "Diversified REITs" },
  { ticker: "PLPC", name: "Preformed Line Prod", sector: "Industrials", industry: "Electrical Equipment" },
  { ticker: "RGR", name: "Sturm Ruger & Co", sector: "Consumer Discretionary", industry: "Leisure Products" },
  { ticker: "NWBI", name: "Northwest Bancshares", sector: "Consumer Discretionary", industry: "Banking" },
  { ticker: "AMWD", name: "American Woodmark", sector: "Industrials", industry: "Building Products" },
  { ticker: "HQY", name: "HealthEquity Inc", sector: "Healthcare", industry: "Health Info Tech" },
  { ticker: "SHOO", name: "Steven Madden Ltd", sector: "Consumer Discretionary", industry: "Footwear" },
  { ticker: "SPSC", name: "SPS Commerce", sector: "Technology", industry: "Software" },
  { ticker: "MGRC", name: "McGrath RentCorp", sector: "Industrials", industry: "Rental & Leasing" },
  { ticker: "KLIC", name: "Kulicke and Soffa", sector: "Technology", industry: "Semiconductor Equipment" },
  { ticker: "VIAV", name: "Viavi Solutions", sector: "Technology", industry: "Communication Equipment" },
  { ticker: "HAYW", name: "Hayward Holdings", sector: "Industrials", industry: "Building Products" },
  { ticker: "CALX", name: "Calix Inc", sector: "Technology", industry: "Communication Equipment" },
  { ticker: "GMS", name: "GMS Inc", sector: "Industrials", industry: "Building Products" },
  { ticker: "CORT", name: "Corcept Therapeutics", sector: "Healthcare", industry: "Biotech" },
  { ticker: "RAMP", name: "LiveRamp Holdings", sector: "Technology", industry: "Software" },
  { ticker: "LNTH", name: "Lantheus Holdings", sector: "Healthcare", industry: "Diagnostics" },
  { ticker: "ITGR", name: "Integer Holdings", sector: "Healthcare", industry: "Medical Devices" },
  { ticker: "MATX", name: "Matson Inc", sector: "Industrials", industry: "Marine Shipping" },
  { ticker: "CVLG", name: "Covenant Logistics", sector: "Industrials", industry: "Trucking" },
  { ticker: "GHC", name: "Graham Holdings", sector: "Communication Services", industry: "Media" },
];

const CA_STOCKS = [
  { ticker: "HPS.A.TO", name: "Hammond Power Sol", sector: "Industrials", industry: "Electrical Equipment" },
  { ticker: "GSY.TO", name: "goeasy Ltd", sector: "Consumer Discretionary", industry: "Consumer Finance" },
  { ticker: "TVK.TO", name: "TerraVest Industries", sector: "Industrials", industry: "Industrial Machinery" },
  { ticker: "TOY.TO", name: "Spin Master Corp", sector: "Consumer Discretionary", industry: "Leisure Products" },
  { ticker: "AIF.TO", name: "Altus Group Ltd", sector: "Real Estate", industry: "Real Estate Services" },
  { ticker: "DSG.TO", name: "Descartes Group", sector: "Technology", industry: "Software" },
  { ticker: "KXS.TO", name: "Kinaxis Inc", sector: "Technology", industry: "Software" },
  { ticker: "TFII.TO", name: "TFI International", sector: "Industrials", industry: "Trucking" },
  { ticker: "ENGH.TO", name: "Enghouse Systems", sector: "Technology", industry: "Software" },
  { ticker: "CTC.A.TO", name: "Canadian Tire", sector: "Consumer Discretionary", industry: "Retail" },
  { ticker: "CCL.B.TO", name: "CCL Industries", sector: "Materials", industry: "Packaging" },
  { ticker: "SJ.TO", name: "Stella-Jones Inc", sector: "Materials", industry: "Wood Products" },
  { ticker: "MG.TO", name: "Magna International", sector: "Consumer Discretionary", industry: "Auto Parts" },
  { ticker: "IFC.TO", name: "Intact Financial", sector: "Consumer Discretionary", industry: "Insurance" },
  { ticker: "GIB.A.TO", name: "CGI Inc", sector: "Technology", industry: "IT Consulting" },
  { ticker: "SHOP.TO", name: "Shopify Inc", sector: "Technology", industry: "Software" },
  { ticker: "DOO.TO", name: "BRP Inc", sector: "Consumer Discretionary", industry: "Leisure Products" },
  { ticker: "PBH.TO", name: "Premium Brands", sector: "Consumer Staples", industry: "Packaged Foods" },
  { ticker: "FSV.TO", name: "FirstService Corp", sector: "Real Estate", industry: "Real Estate Services" },
  { ticker: "LSPD.TO", name: "Lightspeed Commerce", sector: "Technology", industry: "Software" },
  { ticker: "BYD.TO", name: "Boyd Group Services", sector: "Consumer Discretionary", industry: "Auto Repair" },
  { ticker: "WFG.TO", name: "West Fraser Timber", sector: "Materials", industry: "Wood Products" },
  { ticker: "CSU.TO", name: "Constellation Soft", sector: "Technology", industry: "Software" },
  { ticker: "ATD.TO", name: "Alimentation Couche", sector: "Consumer Staples", industry: "Convenience Stores" },
  { ticker: "TIH.TO", name: "Toromont Industries", sector: "Industrials", industry: "Trading Companies" },
];

const EU_STOCKS = [
  { ticker: "BESI.AS", name: "BE Semiconductor", sector: "Technology", industry: "Semiconductor Equipment" },
  { ticker: "ASM.AS", name: "ASM International", sector: "Technology", industry: "Semiconductor Equipment" },
  { ticker: "IMCD.AS", name: "IMCD NV", sector: "Materials", industry: "Specialty Chemicals" },
  { ticker: "LIGHT.AS", name: "Signify NV", sector: "Industrials", industry: "Electrical Equipment" },
  { ticker: "BFIT.AS", name: "Basic-Fit NV", sector: "Consumer Discretionary", industry: "Leisure Facilities" },
  { ticker: "GAM.MC", name: "Gamesa Corporacion", sector: "Industrials", industry: "Electrical Equipment" },
  { ticker: "SRT3.DE", name: "Sartorius AG", sector: "Healthcare", industry: "Life Sciences Tools" },
  { ticker: "EVK.DE", name: "Evonik Industries", sector: "Materials", industry: "Specialty Chemicals" },
  { ticker: "NIBE-B.ST", name: "NIBE Industrier", sector: "Industrials", industry: "Building Products" },
  { ticker: "SWEC-B.ST", name: "Sweco AB", sector: "Industrials", industry: "Engineering" },
  { ticker: "EQT.ST", name: "EQT AB", sector: "Consumer Discretionary", industry: "Asset Management" },
  { ticker: "SAGA-B.ST", name: "Sagax AB", sector: "Real Estate", industry: "Industrial REIT" },
  { ticker: "VCT.L", name: "Victrex PLC", sector: "Materials", industry: "Specialty Chemicals" },
  { ticker: "HLMA.L", name: "Halma PLC", sector: "Technology", industry: "Scientific Instruments" },
  { ticker: "SMIN.L", name: "Smiths Group PLC", sector: "Industrials", industry: "Diversified Industrials" },
  { ticker: "RWS.L", name: "RWS Holdings", sector: "Industrials", industry: "Professional Services" },
  { ticker: "SDR.L", name: "Schroders PLC", sector: "Consumer Discretionary", industry: "Asset Management" },
  { ticker: "BOY.L", name: "Bodycote PLC", sector: "Industrials", industry: "Metal Treatment" },
  { ticker: "DPLM.L", name: "Diploma PLC", sector: "Industrials", industry: "Trading Companies" },
  { ticker: "NXT.L", name: "Next PLC", sector: "Consumer Discretionary", industry: "Apparel Retail" },
  { ticker: "MNDI.L", name: "Mondi PLC", sector: "Materials", industry: "Packaging" },
  { ticker: "DCC.L", name: "DCC PLC", sector: "Industrials", industry: "Distribution" },
  { ticker: "PRSM.AS", name: "Prosus NV", sector: "Technology", industry: "Internet" },
  { ticker: "KER.PA", name: "Kering SA", sector: "Consumer Discretionary", industry: "Luxury Goods" },
  { ticker: "CAP.PA", name: "Capgemini SE", sector: "Technology", industry: "IT Consulting" },
];

function generateStockData(
  base: { ticker: string; name: string; sector: string; industry: string },
  region: "US" | "CA" | "EU"
): StockData {
  const mcapBase = region === "US" ? 50 : region === "CA" ? 80 : 120;
  return {
    ticker: base.ticker,
    name: base.name,
    sector: base.sector,
    industry: base.industry,
    marketCap: rand(mcapBase * 0.3, 290) * 1_000_000,
    price: rand(0.5, 85),
    avgVolume20d: randInt(12000, 500000),
    region,

    // Quality
    roeTTM: nullable(rand(-15, 45), 0.05),
    roiTTM: nullable(rand(-10, 35), 0.05),
    roaTTM: nullable(rand(-8, 25), 0.05),

    // Longevity
    altmanZOrig: nullable(rand(-1, 8), 0.08),
    piotroskiFScore: nullable(randInt(1, 9), 0.05),
    grossMarginTTM: nullable(rand(10, 75), 0.05),

    // Price
    evToEBITDA: nullable(rand(2, 35), 0.1),
    evToSales: nullable(rand(0.3, 12), 0.1),

    // Timing
    priceChange13W: nullable(rand(-35, 60), 0.05),
    priceChange26W: nullable(rand(-40, 80), 0.05),
    priceChange52W: nullable(rand(-50, 120), 0.05),

    // Sentiment
    currentFYRevisionVs4WkAgo: nullable(rand(-15, 25), 0.15),
    shortInterestPctFloat: nullable(rand(0.5, 25), 0.2),
    insiderPurchases: nullable(randInt(0, 12), 0.2),

    // Will be computed
    qualityScore: null,
    longevityScore: null,
    priceScore: null,
    timingScore: null,
    sentimentScore: null,
    compositeScore: null,
    rank: null,
    bucket: null,
  };
}

export function generateSeedData(): StockData[] {
  const allStocks: StockData[] = [];

  for (const base of US_STOCKS) {
    allStocks.push(generateStockData(base, "US"));
  }
  for (const base of CA_STOCKS) {
    allStocks.push(generateStockData(base, "CA"));
  }
  for (const base of EU_STOCKS) {
    allStocks.push(generateStockData(base, "EU"));
  }

  return allStocks;
}
