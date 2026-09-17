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
hamta/platser.json    koordinater per bibliotek
hamta/platser-kultur.json  koordinater per kulturplats
hamta/koordinater.mjs fyller koordinater i de två filerna, körs för hand
hamta/index.mjs       kör allt, skriver webb/data/evenemang.json
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

## Koordinater

`hamta/platser.json` och `hamta/platser-kultur.json` håller en punkt per plats. Nyckeln är exakt den sträng hämtaren skrivit, så kör hämtaren först.

```
node hamta/koordinater.mjs
```

Skriptet lägger till nya platser som dykt upp i datan, och fyller bara poster där `lat` är null. En koordinat du rättat för hand rörs aldrig. Tre steg, i tur och ordning:

1. **Overpass**, alla `amenity=library` i Stockholms kommun, matchas på namn. Tar de flesta biblioteken.
2. **Gatuadressen från `biblioteket.stockholm.se`** för de bibliotek OSM saknar, som sedan geokodas.
3. **Nominatim** på hela platsnamnet för kulturplatserna.

Skriptet fyller bara i det som är entydigt. Namn som `Lava, Kulturhuset` har två led, och vilket som är den riktiga platsen går inte att avgöra maskinellt: i `Stadsmuseet, Slussen` är det ledet före kommat, i `Lava, Kulturhuset` det efter. Sådana listas som förslag att välja mellan för hand i stället för att gissas.

Fältet `kalla` säger var varje punkt kommer ifrån. Står det `ungefärlig mittpunkt` är det en stadsdel, inte en byggnad. Granska alltid `git diff` efteråt.

## Kvar att göra

1. **Designen.** Gränssnittet är funktionellt men opolerat. Riktning inte vald, ta fram några förslag och bestäm innan något byggs.
2. **Datumväljaren.** I dag en `select` med "Alla kommande" plus upp till 30 enskilda dagar, en lång rullgardin man måste öppna för att se vad som finns. Behöver något annat, till exempel snabbval för idag, imorgon och helgen, eller en kalendervy. Riktning inte vald.
3. Stadsdel per arrangör, för filtret som ännu inte finns.
4. Ett modellsteg som ersätter regeltolkningen i `alder.mjs` om reglerna visar sig för trubbiga. Detaljsidehämtningen la till två regexberoenden till, og-taggen och faktarutan.

## Drift

`.github/workflows/hamta.yml` kör hämtaren varje morgon klockan 06 svensk tid, committar `webb/data/evenemang.json` om något ändrats och publicerar `webb/` till GitHub Pages. Samma jobb kör också vid varje push till `main`. Statisk sida, ingen server, ingen databas.

Live: https://fghub-code.github.io/gratis-barnaktiviteter/
