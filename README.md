# Gratis barnaktiviteter i Stockholm

Privat övningsprojekt. Hämtar daterade gratisevenemang för barn, listar dem per dag och visar dem på karta.

## Kör

Kräver Node 20 eller senare, inga beroenden.

```
node hamta/index.mjs        # skriver webb/data/evenemang.json
npx serve webb              # eller valfri statisk server, kör i webb/
```

Öppna inte `webb/index.html` direkt från filsystemet, `fetch` mot JSON-filen blockeras då av webbläsaren. Kör en statisk server med `webb/` som rot.

## Struktur

```
hamta/alder.mjs       tolkning av ålder och pris, samt urvalsreglerna
hamta/bibliotek.mjs   Stockholms stadsbibliotek, GraphQL
hamta/kultur.mjs      kultur.stockholm, HTML
hamta/platser.json    koordinater per bibliotek, ska fyllas i manuellt
hamta/index.mjs       kör allt, skriver webb/data/evenemang.json
hamta/platser-kultur.json  koordinater per kulturplats, ska fyllas i manuellt
webb/index.html       lista per dag, filter, kartflik
webb/data/            genererad data, committas av GitHub Actions
```

## Urvalsregler

- Ålder: allt med undre gräns 7 år eller lägre kommer med, inklusive oklara fall. Finare filtrering sker i gränssnittet. `tolkaAlder` läser åldern ur text, både siffror och ord som "bebis", "förskoleåldern", "mellanstadiet" och "årskurs 3". Årskurs N räknas som ålder N+6.
- Pris: gratis eller högst 50 kronor per person. Tolkas ur text bara för kultur.stockholm, bibliotek är alltid gratis.
- Okänt pris är egen status. Det visas aldrig som gratis och är dolt som standard.

## Källor

**Stockholms stadsbibliotek.** GraphQL på `https://biblioteket.stockholm.se/graphql`, query `eventSearch`. Öppet, ingen nyckel. Odokumenterat internt API, fältnamnen är kartlagda genom att prova 2026-09-09. Introspection är avstängd. Det kan sluta fungera utan förvarning, därför kastar hämtaren ett tydligt fel i stället för att tyst leverera noll rader.

**kultur.stockholm.** Ingen API. HTML skrapas från `kultur.stockholm/kalendarium/?t=event&c=279`, där `c=279` är kategorin Barn och familj. Markupen som parsas är `div.card-inner` med `h4.card-title` och `<time datetime="ÅÅÅÅ-MM-DD">`. Ändrar de sin mall slutar parsern hitta poster.

Varje kort följs sedan upp med ett anrop till sin detaljsida. Därifrån hämtas en kort beskrivning ur `og:description`, som oftast också innehåller åldern, samt plats och pris ur faktarutan. Saknas något behålls listans värde. Detaljsidor som ger 404 eller är märkta inställda tas bort. Det gör hämtningen långsammare, cirka 20 sekunder totalt.

## Kvar att göra

1. **Fyll i `hamta/platser.json`.** Alla 38 bibliotek ligger där med `lat` och `lon` satta till null. Utan koordinater fungerar listan men kartan är tom. Slå upp dem en gång, till exempel via OpenStreetMap, och fyll i. Jag har medvetet inte gissat koordinater.
2. **Fyll i `hamta/platser-kultur.json`.** Sju kulturplatser, samma sak. Nyckeln är den `plats`-sträng hämtaren skrivit, ibland en gatuadress, ibland bara "Gamla stan". Kör hämtaren först så syns vilka strängar som gäller.
3. Stadsdel per arrangör, för filtret som ännu inte finns.
4. Ett modellsteg som ersätter regeltolkningen i `alder.mjs` om reglerna visar sig för trubbiga. Detaljsidehämtningen la till två regexberoenden till, og-taggen och faktarutan.

## Drift

`.github/workflows/hamta.yml` kör hämtaren varje morgon klockan 06 svensk tid, committar `webb/data/evenemang.json` om något ändrats och publicerar `webb/` till GitHub Pages. Samma jobb kör också vid varje push till `main`. Statisk sida, ingen server, ingen databas.

Live: https://fghub-code.github.io/gratis-barnaktiviteter/
