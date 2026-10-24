# Niclas Wheels

En Happy Wheels-liknande 2D ragdoll-fysikleksak. Pappa Niclas cyklar med Lille
Niclas på pakethållaren. Alla människor har Niclas ansikte. Tre banor, allihop
genomspelade och klarade innan de checkades in.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statiskt bygge i dist/
```

## Kontroller

| Tangent | Gör |
|---|---|
| ↑ / W | trampa |
| ↓ / S | bromsa, och backa när du står still |
| ← → | luta cykeln — enda flygkontrollen, och biter hårdare i luften |
| CTRL | släpp / greppa styret |
| SKIFT | släpp / greppa pedalerna |
| MELLANSLAG | hoppa av cykeln |
| Z | slowmotion |
| M | ljud av/på |
| R | börja om banan |
| N | nästa bana |

## Stack

Fysik: [Rapier2D](https://rapier.rs) (Rust→WASM) i fast 60 Hz-steg. Rendering:
vanlig Canvas 2D i meter, med flippad transform så y pekar uppåt som i
fysikvärlden. Ljud: syntetiserat i Web Audio, inga ljudfiler. Bygge: Vite.
Inga andra beroenden.

| Fil | Ansvar |
|---|---|
| `src/ragdoll.js` | skelett, leder, muskler, skada, avslitna lemmar |
| `src/bike.js` | ram, hjul, drivning, stabilitet |
| `src/level.js` | bygger en bana av en deklarativ spec |
| `src/levels.js` | de tre banorna, ren data |
| `src/gore.js` | blod, köttbitar, blodlagret som ligger kvar |
| `src/audio.js` | all ljudsyntes |
| `src/render.js` | all ritning |
| `src/bot.js` | autopilot, bara i dev — se *Speltest* |
| `src/main.js` | spelloop, kollisionshändelser, skadelogik |

## Fysik som inte är uppenbar

**Massa räknas på area.** Rapier2D tar `densitet × area`, inte volym.
Densiteterna i `ragdoll.js` är kg/m², inte kg/m³. Sätter du dem som 3D-värden
väger huvudet 66 kg och ragdollen exploderar vid spawn.

**Ledgränser sätts efter att leden skapats.** 2D-byggets `JointData.limits`
ignoreras helt för revolute-leder — bara prismatic läser dem. Använd
`joint.setLimits(min, max)` på den skapade leden. Samma sak med motorerna.

**Musklerna är skillnaden mellan åkare och ragdoll.** Varje led har en
positionsmotor som håller cykelposen. Styrkan skalas med skadan per kroppsdel
och nollas vid död — därför sitter han stadigt tills han inte gör det.

**Skada mäts i retardation, inte newton.** Samma kraft är en skråma på en bål
och en halshuggning på ett barnhuvud, så kontaktkraften delas med kroppsdelens
massa. Tröskeln i `constants.js` är m/s² (1100 ≈ 110 g). Huvudet har dessutom
`tough: 2.6` — det är en tung kula på en slak hals som slår i marken vid varje
volt, och avhuggning ska vara sällsynt och spektakulär, inte standarddöden.

**Cykeln är tung med flit (45 kg, lågt placerat).** Åkarna är ~110 kg ledad
massa som sitter högt; med en lätt ram kastar de runt ekipaget och det tippar
hela tiden. Ett tungt fordon är vad som gör att det känns som ett spel.

**Toppfarten sitter på cykelns fart, inte hjulets varvtal.** Det ser likvärdigt
ut men att spärra på varvtal stänger av all dragkraft i samma sekund som ett
hjul spinner loss, vilket strandar dig i varje backe.

**Barnet drar tyngdpunkten bakåt** så cykeln loopar av egen kraft. Det finns
enkelriktad dämpning på rotationen, men bara när ena hjulet faktiskt är i
luften — en konstant motkraft motarbetar varje ramp och slänger dig över styret.

**En åkare fastspänd i en hel cykel är nästan oskadlig** — ramen tar allt.
Därför har cykeln `integrity`: hinder tuggar sönder den, och vid noll kastas
alla av. Utan det är spikgropar helt ofarliga.

## Banregler

Brott mot någon av dessa gör en bana omöjlig snarare än svår. Alla tre
upptäcktes genom att autopiloten fastnade på exakt samma ställe varje gång.

* **Varje grop är antingen hoppbar** (ramp före, gap under ~5 m) **eller har en
  cyklingsbar väg upp** (max ~20°). En lodrät vägg på andra sidan är en
  återvändsgränd.
* **Landa i en nedförslutning, aldrig på plan mark.** En plan landning i fart
  är det som förvandlar ett bra hopp till en halshuggning.
* **Runda av krön och rampkanter.** En skarp knyck i 40 km/h slungar cykeln i
  luften och den landar med nosen först.
* **Inget hängande i taket.** Utan en duck-rörelse är en hängande såg bara en
  höjdkontroll som åkaren alltid missar.
* **Inget i botten av en svacka.** Dit kommer du utan fart, och det som stoppar
  dig där är en fälla, inte ett hinder.
* **Minor bara där man flyger över dem.** Utan sidledsstyrning är en mina på
  körlinjen ingen utmaning utan ett myntkast.
* **Lådor ska vara lätta** (`density` ~26). Tunga lådor är vägspärrar.

## Nya banor

Lägg till ett objekt i `LEVELS` i `src/levels.js`. Marken är en sammanhängande
polyline; allt annat placeras ovanpå:

```js
{ t: 'terrain', points: [[0,0], [20,0], [24,3]] }
{ t: 'spikes',  x, y, count, width, height, damage, dps, bikeDamage }
{ t: 'saw',     x, y, r, speed, path: { x, y, dx, dy, speed } }
{ t: 'mine',    x, y, power }
{ t: 'boost',   x, y, w, h, fx, fy }
{ t: 'box' | 'crate', x, y, w, h, angle }
{ t: 'finish',  x, y }
```

Dra ut marken en bra bit utanför start och mål, annars syns kanten på världen.
Gör boostplattor höga (`h: 1.8`) — en tunn platta missas helt när hjulet är
lite i luften.

## Speltest

`src/bot.js` är en autopilot som kör banan via samma tangentbordshanterare som
en människa. Den finns för att svara på en enda fråga: går banan att klara?

```js
const bot = await __g.bot();
await bot.run(0, 30);   // banindex, max sekunder
// { outcome: 'WON' | 'DIED' | 'STUCK', maxX, diedAt, damage, severed, seconds }
```

`STUCK` betyder att den inte kom vidare på sex sekunder, och är nästan alltid
ett banfel snarare än ett förarfel. Botten gasar inte blint: den bromsar i långa
utförsbackar och styr bara i luften — styr man mot vågrätt även på marken
motarbetar man varje uppförsbacke.

Övriga dev-verktyg i konsolen: `__g.dad`, `__g.kid`, `__g.bike`, `__g.cam`,
`__g.loadLevel(n)`, `__g.mass(doll)` och `__g.forceLog(true)` som loggar varje
kontaktkraft så att skadorna går att kalibrera mot riktiga siffror.

## Inte byggt än

Banredigerare och bandelning — det var det som höll Happy Wheels vid liv i tio
år. Fler fordon. Fler karaktärer (samma ansikte, annan kropp).

## Produktionsbygge

`npm run build` ger ~3,4 MB, varav nästan allt är Rapiers WASM inbakad som
base64 av `rapier2d-compat`. Byt till paketet `@dimforge/rapier2d` om storleken
någonsin spelar roll — då laddas `.wasm` som en separat fil.

`base: './'` i `vite.config.js` gör att bygget fungerar både i roten och under
en underkatalog, vilket GitHub Pages kräver.
