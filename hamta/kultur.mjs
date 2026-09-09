// Hämtar kategorin "Barn och familj" från Stockholms stads kalendarium.
// Ingen API finns. Sidan är serverrenderad HTML med stabil markup, se README.
// Parametrar: t=event, c=279 (Barn och familj), sida=N
//
// Steg två: varje kort följs upp med ett anrop till sin detaljsida. Där finns
// en kort beskrivning (og:description) som ofta också innehåller åldern i klartext,
// samt Plats och Pris i en faktaruta. Saknas något behålls det som listan gav.

import { readFile } from 'node:fs/promises';
import { tolkaAlder, alderPasserar, tolkaPris } from './alder.mjs';

const BAS = 'https://kultur.stockholm/kalendarium/';
const KATEGORI_BARN_OCH_FAMILJ = 279;
const UA = 'gratis-barnaktiviteter (privat projekt)';

// Ord som betyder att evenemanget inte längre är giltigt. Söks bara i
// faktarutan runt "Datum:", inte i hela sidan, för att undvika träff i
// menyer eller nyhetslistor.
const INSTALLT = /\b(inställt|inställd|inställda|evenemanget har ägt rum)\b/i;

function avkoda(s = '') {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ')
    .trim();
}

// Relativa länkar i listan görs absoluta. kultur.stockholm har medvetet
// dubblad sökväg, /kalendarium/kalendarium/, den ska inte tas bort.
function absolutLank(lank) {
  if (!lank) return null;
  if (lank.startsWith('http')) return lank;
  return 'https://kultur.stockholm' + (lank.startsWith('/') ? lank : '/' + lank);
}

// Plockar ut varje kort ur listan. Markupen är div.card-inner med h4.card-title.
export function tolkaSida(html) {
  const kort = html.split('class="card-inner"').slice(1);
  return kort.map(bit => {
    const lank = bit.match(/href=["']([^"']*\/kalendarium\/[^"']*)["']/);
    const titel = bit.match(/class=["']expanded-link["'][^>]*>([^<]+)</);
    const datum = bit.match(/<time datetime=["'](\d{4}-\d{2}-\d{2})["']/);
    const tider = [...bit.matchAll(/<time datetime=["'](\d{1,2}[.:]\d{2})["']/g)].map(m => m[1].replace('.', ':'));
    const platsBit = bit.match(/Plats:<\/span>([\s\S]{0,200}?)<\/p>/);
    const prisBit = bit.match(/Pris:<\/span>([\s\S]{0,120}?)<\/p>/);
    return {
      lank: absolutLank(lank ? lank[1] : null),
      titel: titel ? avkoda(titel[1]) : null,
      datum: datum ? datum[1] : null,
      starttid: tider[0] || null,
      sluttid: tider[1] || null,
      plats: platsBit ? avkoda(platsBit[1]) : null,
      prisText: prisBit ? avkoda(prisBit[1]) : null
    };
  }).filter(k => k.titel && k.datum);
}

// Hämtar en detaljsida och plockar ut beskrivning, plats och pris.
// Returnerar { saknas: true } om sidan är borta, { installt: true } om
// evenemanget är inställt, null vid nätfel (då behålls listans data).
async function hamtaDetalj(url) {
  let svar;
  try {
    svar = await fetch(url, { headers: { 'user-agent': UA } });
  } catch {
    return null;
  }
  if (svar.status === 404 || svar.status === 410) return { saknas: true };
  if (!svar.ok) return null;

  const html = await svar.text();

  const og = html.match(/<meta property=["']og:description["'] content=["']([^"']*)["']/i);
  const beskrivning = og ? avkoda(og[1]).slice(0, 400) : '';

  const platsM = html.match(/Plats:<\/span>([\s\S]{0,200}?)<\/p>/);
  const prisM = html.match(/Pris:<\/span>([\s\S]{0,120}?)<\/p>/);

  // Faktarutan: från "Datum:" till slutet av prisraden. Bara här letar vi
  // efter "inställt".
  const datumPos = html.search(/Datum:<\/span>/);
  const faktaruta = datumPos >= 0 ? avkoda(html.slice(datumPos, datumPos + 1200)) : '';
  if (INSTALLT.test(faktaruta) || INSTALLT.test(beskrivning)) return { installt: true };

  return {
    beskrivning,
    plats: platsM ? avkoda(platsM[1]) : null,
    prisText: prisM ? avkoda(prisM[1]) : null
  };
}

async function laddaPlatser() {
  try {
    const text = await readFile(new URL('./platser-kultur.json', import.meta.url), 'utf8');
    return JSON.parse(text);
  } catch (e) {
    console.error('Kunde inte läsa platser-kultur.json, kartan blir tom för kultur: ' + e.message);
    return {};
  }
}

export async function hamtaKultur(maxSidor = 15) {
  const rada = [];
  for (let sida = 1; sida <= maxSidor; sida++) {
    const url = `${BAS}?t=event&c=${KATEGORI_BARN_OCH_FAMILJ}&sida=${sida}`;
    const svar = await fetch(url, { headers: { 'user-agent': UA } });
    if (!svar.ok) throw new Error(`kultur.stockholm svarade ${svar.status} på sida ${sida}.`);
    const poster = tolkaSida(await svar.text());
    if (!poster.length) break;
    const nya = poster.filter(p => !rada.some(r => r.lank === p.lank));
    if (!nya.length) break; // samma sida igen, alltså slut
    rada.push(...nya);
  }

  const platser = await laddaPlatser();
  const ut = [];
  let borttagna = 0;

  for (const p of rada) {
    if (!p.lank) continue;
    const detalj = await hamtaDetalj(p.lank);
    if (detalj?.saknas || detalj?.installt) { borttagna++; continue; }

    const beskrivning = detalj?.beskrivning || '';
    const plats = detalj?.plats || p.plats;
    // Åldern tolkas ur titel + beskrivning. Beskrivningen har ofta "från 5 år"
    // eller "6–10 år". Hittas inget förblir åldern okänd och tas med.
    const alder = tolkaAlder([p.titel, beskrivning].filter(Boolean).join(' '), '');
    // Priset från detaljsidan är mer att lita på än listan. Saknas det på
    // båda ställena blir status okant, aldrig gratis.
    const pris = tolkaPris(detalj?.prisText ?? p.prisText);

    const koord = (plats && platser[plats]) || {};

    ut.push({
      id: 'kul-' + (p.lank || p.titel).split('/').filter(Boolean).pop(),
      titel: p.titel,
      beskrivning,
      arrangor: vardArrangor(p.lank),
      plats,
      stadsdel: koord.stadsdel || null,
      lat: koord.lat ?? null,
      lon: koord.lon ?? null,
      datum: p.datum,
      slutdatum: p.datum,
      starttid: p.starttid,
      sluttid: p.sluttid,
      aterkommande: false,
      kraverBokning: false,
      alder,
      pris,
      kategori: 'Barn och familj',
      underkategori: null,
      bild: null,
      lank: p.lank,
      kalla: 'kultur.stockholm'
    });
  }

  const kvar = ut.filter(e => alderPasserar(e.alder));
  const forGamla = ut.length - kvar.length;
  if (borttagna || forGamla) {
    console.error(`kultur.stockholm: tog bort ${borttagna} borttagna/inställda, ${forGamla} med åldersgräns över 7`);
  }
  return kvar;
}

function vardArrangor(lank = '') {
  const m = String(lank).match(/https?:\/\/([^./]+)\.stockholm/);
  if (!m) return 'Stockholms stad';
  const namn = { stadsmuseet: 'Stadsmuseet', medeltidsmuseet: 'Medeltidsmuseet', stadsarkivet: 'Stadsarkivet', liljevalchs: 'Liljevalchs', ung: 'Ung i Stockholm', kultur: 'Stockholms stad' };
  return namn[m[1]] || m[1];
}
