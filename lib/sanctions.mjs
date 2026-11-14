// code/lib/sanctions.mjs: offline match against the US Treasury OFAC SDN list (free, public).
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function parseSdn(csvText) {
  const names = [];
  for (const line of csvText.split("\n")) {
    const m = line.match(/^\d+,"([^"]*)"/);
    if (m) names.push(norm(m[1]));
  }
  return names;
}

export function matchSdn(name, names) {
  const q = norm(name ?? "");
  if (q.length < 4) return { matched: false, hit: null };
  // Whole words only. A one-word name matches a whole listed name, or (7+ letters) its first word:
  // "Garantex" hits "GARANTEX EUROPE OU", but "Tether" must not hit "ABAN TETHER EXCHANGE" and "Bank" is too generic.
  const multi = (s) => s.includes(" ");
  const within = (outer, inner) => ` ${outer} `.includes(` ${inner} `);
  const hit = names.find((n) => n === q || (multi(q) && within(n, q)) || (multi(n) && within(q, n))
    || (!multi(q) && q.length >= 7 && n.startsWith(q + " ")));
  return { matched: Boolean(hit), hit: hit ?? null };
}

let cache = null;
export async function loadSdn(fetchFn = fetch) {
  cache ??= parseSdn(await (await fetchFn("https://www.treasury.gov/ofac/downloads/sdn.csv")).text());
  return cache;
}
