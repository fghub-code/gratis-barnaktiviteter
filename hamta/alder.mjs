// Tolkar ålder och pris ur fritext. Regelbaserat, inget modellanrop.
// Regel: ta med allt vars undre åldersgräns är 7 år eller lägre, inklusive oklara fall.

const MAX_UNDRE_ALDER = 7;

// Kategorier som i praktiken alltid riktar sig till små barn.
const SMABARNSKATEGORIER = ['Sagostund', 'Rim och ramsor', 'Sångstund', 'Skaparverkstad'];

export function tolkaAlder(text = '', kategori = '') {
  const t = String(text).toLowerCase().replace(/–/g, '-');

  // "3-6 år", "6 - 12 år"
  const spann = t.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*år/);
  if (spann) return { fran: +spann[1], till: +spann[2], kalla: 'spann i text' };

  // "från 5 år", "5 år och uppåt"
  const fran = t.match(/(?:från|fr\.o\.m\.?|över)\s*(\d{1,2})\s*år/) || t.match(/(\d{1,2})\s*år\s*och\s*upp/);
  if (fran) return { fran: +fran[1], till: null, kalla: 'undre gräns i text' };

  // "för barn upp till 6 år"
  const till = t.match(/upp till\s*(\d{1,2})\s*år/);
  if (till) return { fran: 0, till: +till[1], kalla: 'övre gräns i text' };

  // "0-3 år" skrivs ibland som "0-3"
  const bart = t.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\b(?!\s*(kr|kronor))/);
  if (bart && +bart[2] <= 19) return { fran: +bart[1], till: +bart[2], kalla: 'spann utan enhet' };

  if (SMABARNSKATEGORIER.includes(kategori)) {
    return { fran: null, till: null, kalla: 'kategori tyder på små barn' };
  }
  return { fran: null, till: null, kalla: 'okänd' };
}

// true om evenemanget ska med. Okänd ålder tas med, enligt beslutad regel.
export function alderPasserar(alder) {
  if (alder.fran === null || alder.fran === undefined) return true;
  return alder.fran <= MAX_UNDRE_ALDER;
}

// "Gratis" -> 0, "50 kr" -> 50, "75-150 kr" -> 75, saknas -> null (okänt, aldrig 0)
export function tolkaPris(text) {
  if (text === null || text === undefined || String(text).trim() === '') {
    return { lagsta: null, text: null, status: 'okant' };
  }
  const raw = String(text).trim();
  const t = raw.toLowerCase().replace(/–/g, '-');
  if (/gratis|fri entré|fritt inträde|kostnadsfri/.test(t)) {
    return { lagsta: 0, text: raw, status: 'gratis' };
  }
  const tal = [...t.matchAll(/(\d+)\s*(?:kr|kronor)?/g)].map(m => +m[1]).filter(n => !isNaN(n));
  if (!tal.length) return { lagsta: null, text: raw, status: 'okant' };
  const lagsta = Math.min(...tal);
  return { lagsta, text: raw, status: lagsta === 0 ? 'gratis' : 'kostar' };
}

export const MAX_PRIS = 50;

// Okänt pris sållas inte bort här. Det sparas med status okant och göms
// som standard i gränssnittet, så att det aldrig visas som gratis.
export function prisPasserar(pris) {
  if (pris.status === 'okant') return true;
  return pris.lagsta <= MAX_PRIS;
}
