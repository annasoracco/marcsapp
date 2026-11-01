// Extra tickers beyond the S&P 500/400/600 and Nasdaq-100 lists.
// Names come from the price source; `cat` is the bucket used for the sector mix.

const US = 'U.S. stock fund';
const INTL = 'International stock fund';
const GLOBAL = 'Global stock fund';
const BOND = 'Bond fund';
const BAL = 'Balanced & target-date fund';
const THEME = 'Sector & theme fund';
const COMMOD = 'Gold & commodities';
const CRYPTO = 'Crypto fund';

const group = (cat, kind, syms) => syms.split(/\s+/).filter(Boolean).map((sym) => ({ sym, cat, kind }));

export const FUNDS = [
  ...group(US, 'etf', `SPY VOO IVV SPLG VTI ITOT SCHB SCHX RSP DIA IWB VV IWM IJH IJR MDY VO VB VXF SCHA IWR
    VUG VTV IWF IWD SCHG SCHV MGK SPYG SPYV QQQ QQQM VIG SCHD VYM DGRO NOBL JEPI JEPQ COWZ MTUM USMV QUAL`),
  ...group(US, 'fund', `FXAIX FZROX FSKAX FNILX FSMDX FSSNX FSMAX VFIAX VTSAX VIGAX VIMAX VSMAX VVIAX VEXAX
    SWPPX SWTSX AGTHX FCNTX TRBCX FDGRX PRGFX DODGX VDIGX VPMCX FMAGX AIVSX ANCFX PRNHX POAGX VPCCX VWUSX
    FBGRX FOCPX`),
  ...group(INTL, 'etf', 'VXUS VEA VWO IEFA EFA EEM IEMG IXUS SCHF SCHE EWJ INDA MCHI FXI'),
  ...group(INTL, 'fund', 'VTIAX FTIHX FZILX FSPSX SWISX VTMGX VFWAX DODFX AEPGX'),
  ...group(GLOBAL, 'etf', 'VT ACWI'),
  ...group(GLOBAL, 'fund', 'VTWAX ANWPX CWGIX'),
  ...group(BOND, 'etf', 'BND AGG BNDX TLT IEF SHY LQD HYG JNK TIP VTEB MUB SCHZ VCIT VCSH BSV BIV VGIT GOVT SGOV BIL SHV USFR'),
  ...group(BOND, 'fund', 'FXNAX VBTLX SWAGX PTTRX PIMIX DODIX'),
  ...group(BAL, 'etf', 'AOR AOA AOM'),
  ...group(BAL, 'fund', 'VWELX VWENX VBIAX ABALX FBALX VWINX VTTVX VTHRX VTTHX VFORX VTIVX VFIFX VFFVX VTTSX'),
  ...group('Information Technology', 'etf', 'XLK VGT SMH SOXX IGV CIBR'),
  ...group('Information Technology', 'fund', 'FSPTX FSELX'),
  ...group('Financials', 'etf', 'XLF VFH KRE KBE'),
  ...group('Health Care', 'etf', 'XLV VHT XBI IBB'),
  ...group('Energy', 'etf', 'XLE VDE'),
  ...group('Consumer Discretionary', 'etf', 'XLY ITB XHB XRT'),
  ...group('Consumer Staples', 'etf', 'XLP'),
  ...group('Industrials', 'etf', 'XLI IYT ITA XAR'),
  ...group('Materials', 'etf', 'XLB GDX'),
  ...group('Utilities', 'etf', 'XLU'),
  ...group('Real Estate', 'etf', 'XLRE VNQ'),
  ...group('Communication Services', 'etf', 'XLC'),
  ...group(THEME, 'etf', 'ARKK BOTZ ICLN TAN'),
  ...group(COMMOD, 'etf', 'GLD IAU SLV USO DBC PDBC'),
  ...group(CRYPTO, 'etf', 'IBIT FBTC GBTC ETHA BITO'),
];

// What the Market tab shows. `label` is the short display name.
export const MARKET = {
  indexes: [
    { sym: '^GSPC', label: 'S&P 500', kind: 'index' },
    { sym: '^IXIC', label: 'Nasdaq', kind: 'index' },
    { sym: '^DJI', label: 'Dow', kind: 'index' },
    { sym: '^RUT', label: 'Russell 2000', kind: 'index' },
  ],
  sectors: [
    { sym: 'XLK', label: 'Technology', kind: 'etf' },
    { sym: 'XLC', label: 'Communication', kind: 'etf' },
    { sym: 'XLY', label: 'Consumer discretionary', kind: 'etf' },
    { sym: 'XLP', label: 'Consumer staples', kind: 'etf' },
    { sym: 'XLV', label: 'Health care', kind: 'etf' },
    { sym: 'XLF', label: 'Financials', kind: 'etf' },
    { sym: 'XLI', label: 'Industrials', kind: 'etf' },
    { sym: 'XLE', label: 'Energy', kind: 'etf' },
    { sym: 'XLB', label: 'Materials', kind: 'etf' },
    { sym: 'XLU', label: 'Utilities', kind: 'etf' },
    { sym: 'XLRE', label: 'Real estate', kind: 'etf' },
  ],
  themes: [
    { sym: 'SMH', label: 'Semiconductors', kind: 'etf' },
    { sym: 'IGV', label: 'Software', kind: 'etf' },
    { sym: 'XBI', label: 'Biotech', kind: 'etf' },
    { sym: 'KRE', label: 'Regional banks', kind: 'etf' },
    { sym: 'ITB', label: 'Homebuilders', kind: 'etf' },
    { sym: 'XRT', label: 'Retail', kind: 'etf' },
    { sym: 'IYT', label: 'Transports', kind: 'etf' },
    { sym: 'ITA', label: 'Aerospace & defense', kind: 'etf' },
    { sym: 'GDX', label: 'Gold miners', kind: 'etf' },
    { sym: 'ARKK', label: 'ARK Innovation', kind: 'etf' },
  ],
  other: [
    { sym: '^VIX', label: 'VIX fear gauge', kind: 'index' },
    { sym: 'GC=F', label: 'Gold', kind: 'commodity', cat: COMMOD },
    { sym: 'CL=F', label: 'Crude oil', kind: 'commodity', cat: COMMOD },
    { sym: 'BTC-USD', label: 'Bitcoin', kind: 'crypto', cat: 'Crypto' },
    { sym: 'TLT', label: 'Long Treasuries', kind: 'etf' },
    { sym: 'EFA', label: 'Intl developed', kind: 'etf' },
    { sym: 'EEM', label: 'Emerging markets', kind: 'etf' },
  ],
};
