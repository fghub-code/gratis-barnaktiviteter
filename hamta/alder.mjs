// Tolkar ålder och pris ur fritext. Regelbaserat, inget modellanrop.
// Regel: ta med allt vars undre åldersgräns är 7 år eller lägre, inklusive oklara fall.

const MAX_UNDRE_ALDER = 7;

// Kategorier som i praktiken alltid riktar sig till små barn.
const SMABARNSKATEGORIER = ['Sagostund', 'Rim och ramsor', 'Sångstund', 'Skaparverkstad'];

// Skolstadier till ungefärlig ålder. Årskurs N börjar vid ålder N+6.
// Används bara när ingen ålder i siffror hittas.
const STADIER = [
  { ord: 'låg',    fran: 7, till: 9 },
  { ord: 'mellan', fran: 10, till: 12 },
  { ord: 'hög',    fran: 13, till: 15 }
];

// Sant om stadiet nämns, antingen som "lågstadiet" eller i en uppräkning
// som "låg, mellan eller högstadiet".
function stadieNamns(t, ord) {
  return new RegExp(`\\b${ord}(?:stadi|\\s*[,/]|\\s+(?:och|eller)\\b)`, 'i').test(t);
}

export function tolkaAlder(text = '', kategori = '') {
  const t = String(text).toLowerCase().replace(/–/g, '-');

  // "mellan 7 och 13 år"
  const mellan = t.match(/mellan\s*(\d{1,2})\s*och\s*(\d{1,2})\s*år/);
  if (mellan) return { fran: +mellan[1], till: +mellan[2], kalla: 'mellan x och y i text' };

  // "3 månader till 2 år", spädbarn upp till en åldersgräns i år
  const manTill = t.match(/(\d{1,2})\s*m[åa]n(?:ader)?\s*till\s*(\d{1,2})\s*år/);
  if (manTill) return { fran: 0, till: +manTill[2], kalla: 'månader till år i text' };

  // "6-24 mån", "bebisar 4-10 månader", ren månadsålder betyder 0-1 år
  if (/\d{1,2}\s*-\s*\d{1,2}\s*m[åa]n(?:ader)?\b/.test(t) || /\bbarn\s*\d{1,2}\s*m[åa]n(?:ader)?\b/.test(t)) {
    return { fran: 0, till: 1, kalla: 'månadsålder i text' };
  }

  // "3-6 år", "6 - 12 år"
  const spann = t.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*år/);
  if (spann) return { fran: +spann[1], till: +spann[2], kalla: 'spann i text' };

  // "3 till 5 år", "ca 3 till 5 år". Struntas i om första talet är störst,
  // då är det troligen "3 [månader] till 2 år" som redan fångats fel.
  const tillSpann = t.match(/(\d{1,2})\s*till\s*(\d{1,2})\s*år/);
  if (tillSpann && +tillSpann[1] <= +tillSpann[2]) {
    return { fran: +tillSpann[1], till: +tillSpann[2], kalla: 'spann med till i text' };
  }

  // "från 5 år", "från cirka 3 år", "5 år och uppåt"
  const fran = t.match(/(?:från|fr\.o\.m\.?|över)\s*(?:cirka\s*|ca\.?\s*|ungefär\s*)?(\d{1,2})\s*år/)
    || t.match(/(\d{1,2})\s*år\s*och\s*upp/);
  if (fran) return { fran: +fran[1], till: null, kalla: 'undre gräns i text' };

  // "för barn upp till 6 år"
  const till = t.match(/upp till\s*(\d{1,2})\s*år/);
  if (till) return { fran: 0, till: +till[1], kalla: 'övre gräns i text' };

  // "de allra yngsta", "bebisar", "spädbarn"
  if (/\b(bebis|bäbis|spädbarn|nyfödd|de yngsta|allra yngsta)/.test(t)) {
    return { fran: 0, till: 1, kalla: 'ord för spädbarn i text' };
  }

  // "i förskoleåldern"
  if (/förskoleålder/.test(t)) return { fran: 1, till: 5, kalla: 'förskoleålder i text' };

  // "0-3 år" skrivs ibland som "0-3"
  const bart = t.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\b(?!\s*(kr|kronor))/);
  if (bart && +bart[2] <= 19) return { fran: +bart[1], till: +bart[2], kalla: 'spann utan enhet' };

  // Skolstadier. Nämns flera ("låg, mellan eller högstadiet") tas det lägsta
  // och övre gränsen lämnas öppen, det är ett brett evenemang.
  const namnda = STADIER.filter(s => stadieNamns(t, s.ord));
  if (namnda.length) {
    return {
      fran: namnda[0].fran,
      till: namnda.length > 1 ? null : namnda[0].till,
      kalla: 'skolstadium i text'
    };
  }

  // "årskurs 3, 4 och 5" -> lägsta årskursen, ålder = årskurs + 6
  const ak = t.match(/(?:årskurs|årskurserna|åk)\s*(\d{1,2})/);
  if (ak) return { fran: +ak[1] + 6, till: null, kalla: 'årskurs i text' };

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
