// code/lib/sanctions.mjs: offline match against the US Treasury OFAC SDN list (free, public).
// Aliases live in OFAC's separate alt.csv, which we do not load, so some aliases are missed.
const SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function parseSdn(csvText) {
  const names = [];
  for (const line of csvText.split("\n")) {
    const m = line.match(/^\d+,"([^"]*)"/);
    if (m) names.push(norm(m[1]));
  }
  return names;
}

// Whole words only. Only multi-word names can be a definite match ("Tether" must not hit
// "ABAN TETHER EXCHANGE"). A one-word name equal to a listed name (e.g. the vessel "DIANA")
// is only reported as `possible`, so the verdict says CAUTION and a human judges it.
export function matchSdn(name, names) {
  const q = norm(name ?? "");
  if (q.length < 4) return { matched: false, hit: null };
  const multi = (s) => s.includes(" ");
  const within = (outer, inner) => ` ${outer} `.includes(` ${inner} `);
  if (!multi(q)) {
    const possible = names.find((n) => n === q);
    return possible ? { matched: false, hit: null, possible } : { matched: false, hit: null };
  }
  const hit = names.find((n) => within(n, q) || (multi(n) && within(q, n)));
  return { matched: Boolean(hit), hit: hit ?? null };
}

let cache = null;
export async function loadSdn(fetchFn = fetch) {
  if (cache) return cache;
  const res = await fetchFn(SDN_URL);
  if (!res.ok) throw new Error(`OFAC list HTTP ${res.status}`);
  const names = parseSdn(await res.text());
  if (names.length < 5000) throw new Error(`OFAC list looks truncated (${names.length} names)`);
  return (cache = names);
}
