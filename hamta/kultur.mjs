// Hämtar kategorin "Barn och familj" från Stockholms stads kalendarium.
// Ingen API finns. Sidan är serverrenderad HTML med stabil markup, se README.
// Parametrar: t=event, c=279 (Barn och familj), sida=N

import { tolkaAlder, alderPasserar, tolkaPris } from './alder.mjs';

const BAS = 'https://kultur.stockholm/kalendarium/';
const KATEGORI_BARN_OCH_FAMILJ = 279;

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
      lank: lank ? lank[1] : null,
      titel: titel ? avkoda(titel[1]) : null,
      datum: datum ? datum[1] : null,
      starttid: tider[0] || null,
      sluttid: tider[1] || null,
      plats: platsBit ? avkoda(platsBit[1]) : null,
      prisText: prisBit ? avkoda(prisBit[1]) : null
    };
  }).filter(k => k.titel && k.datum);
}

export async function hamtaKultur(maxSidor = 15) {
  const rada = [];
  for (let sida = 1; sida <= maxSidor; sida++) {
    const url = `${BAS}?t=event&c=${KATEGORI_BARN_OCH_FAMILJ}&sida=${sida}`;
    const svar = await fetch(url, { headers: { 'user-agent': 'gratis-barnaktiviteter (privat projekt)' } });
    if (!svar.ok) throw new Error(`kultur.stockholm svarade ${svar.status} på sida ${sida}.`);
    const poster = tolkaSida(await svar.text());
    if (!poster.length) break;
    const nya = poster.filter(p => !rada.some(r => r.lank === p.lank));
    if (!nya.length) break; // samma sida igen, alltså slut
    rada.push(...nya);
  }

  return rada.map(p => {
    const alder = tolkaAlder(p.titel || '', '');
    return {
      id: 'kul-' + (p.lank || p.titel).split('/').filter(Boolean).pop(),
      titel: p.titel,
      beskrivning: '',
      arrangor: vardArrangor(p.lank),
      plats: p.plats,
      stadsdel: null,
      lat: null,
      lon: null,
      datum: p.datum,
      slutdatum: p.datum,
      starttid: p.starttid,
      sluttid: p.sluttid,
      aterkommande: false,
      kraverBokning: false,
      alder,
      pris: tolkaPris(p.prisText),
      kategori: 'Barn och familj',
      underkategori: null,
      bild: null,
      lank: p.lank,
      kalla: 'kultur.stockholm'
    };
  }).filter(e => alderPasserar(e.alder));
}

function vardArrangor(lank = '') {
  const m = String(lank).match(/https?:\/\/([^./]+)\.stockholm/);
  if (!m) return 'Stockholms stad';
  const namn = { stadsmuseet: 'Stadsmuseet', medeltidsmuseet: 'Medeltidsmuseet', stadsarkivet: 'Stadsarkivet', liljevalchs: 'Liljevalchs', ung: 'Ung i Stockholm', kultur: 'Stockholms stad' };
  return namn[m[1]] || m[1];
}
