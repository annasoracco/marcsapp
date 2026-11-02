/** "NVIDIA Corporation" -> "NVIDIA", "The Walt Disney Company" -> "Walt Disney". */
export function shortName(name: string): string {
  let s = name.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|Holdings?|Group|plc|PLC|Ltd\.?|Limited|N\.V\.|S\.A\.|AG|SE|L\.P\.|LP|Class [A-C])$/i, "")
      .replace(/\s*\((The|Class [A-C])\)$/i, "")
      .trim();
  }
  s = s.replace(/^The\s+/i, "").replace(/\s*\.$/, "");
  // Yahoo spells some names in capitals; "NVIDIA" reads better as "Nvidia" in a sentence.
  if (/^[A-Z]{5,}$/.test(s)) s = s.charAt(0) + s.slice(1).toLowerCase();
  return s;
}
