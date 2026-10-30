# Majlis Party — مجلس بارتي

A projector party mode for ND96: one big screen, 20–45 phones, six colour teams, a wheel of short
server-authoritative minigames, and a team podium at the end.

It runs as its **own service on its own port** (`party/server.js`, default **9511**) next to the Asir race
server — the race roster is hard-wired to two teams and one mode, the party needs six teams, formats and a
phase machine.

## Run it

```bash
PORT=9511 ADMIN_KEY=your-key node party/server.js
PUBLIC_URL=https://… PORT=9511 ADMIN_KEY=… node party/server.js   # force the URL shown on screen
```

| Route | Who | What |
|---|---|---|
| `/` | guests | landing page with the QR + join code |
| `/host` | projector | the show: lobby QR, wheel, slot machine, arenas, results, podium |
| `/play` | phones | the one pad page every minigame uses |
| `/admin` | host phone | start, pause, skip, pick a game, mark AFK, kick, adjust points |
| `/api/state`, `/api/games` | tooling | JSON state and the minigame list |

## Party flow

`lobby → wheel → [slot] → announce → countdown → playing → results → … → final`

* The **wheel** draws the next minigame (no repeat inside the last four draws; the pool rotates formats).
* The **slot machine** only runs for `spotlight` games: it stops on one player per team, one pass each before
  anybody repeats, AFK players skipped. Their phones buzz.
* Formats: `team` (TEAM vs TEAM), `spotlight` (1v1 with spectator bets), `ffa` (everyone for themselves —
  points still go to the team total). Every intro card prints the format in large type.
* Scores are team points by placement (100 / 80 / 65 / 50 / 40 / 30), plus per-player points for the podium.

## Minigames (16)

| # | Game | Format | Idea |
|---|---|---|---|
| 1 | قفزة الموجة Sweep Jump | team/ffa | jump as the sweeping beam crosses you |
| 2 | ذاكرة الأسهم Arrow Memory | team/ffa | repeat the arrow sequence, wrong arrow stuns |
| 3 | اللون الآمن Safe Colour | team/ffa | run to the called colour before it shrinks |
| 4 | سومو الرمل Sand Sumo | team/ffa/1v1 | push rivals off the sand disc |
| 9 | نفخ البالون Balloon Pump | team/1v1 | hold to pump, release to pass, hidden burst |
| 10 | تعبئة الكأس Glass Fill | team/1v1 | hold to pour, release to stop, spill = out |
| 11 | طائرات السماء Sky Jets | team | 20 Hz views, majority vote steers team jets |
| 12 | جسر الزجاج Glass Bridge | team | identical hidden pattern per team, vote left/right |
| 13 | قلوب في مهبّ Heart Dodge | ffa/team/1v1 | bullet-hell hearts, telegraphed waves |
| 14 | دبابات الحمم Lava Tanks | 1v1/team | turn-based artillery over a lava pit |
| 19 | الدلّة الساخنة Hot Dallah | ffa/team | hidden fuse, tap to pass |
| 20 | مبارزة السيوف Sword Clash | 1v1 | simultaneous guards, best of five |
| 21 | برج الصناديق Box Tower | team | drop the swinging crate on the stack |
| 23 | ارسم الخط Trace Race | ffa/team | trace the shape, scored on coverage + accuracy |
| 24 | سباق الكلمات Word Race | team | unscramble and type the word first |
| 26 | اختيار الحظ Lucky Pick | ffa/team/1v1 | five chests, one trap |

Every module is one file in `party/games/` with the same contract:
`create / onStart / onInput / tick / over / finish / hostView / padView`.

## Latency

Every game is judged in its own window, never against another player's tap:
the pad view is a snapshot, inputs carry no timestamp the server trusts, and games that must feel fast
(Sky Jets) run 20 Hz views with votes sampled every 120 ms and freshest-tap weighting.
Simultaneous-choice games (Sword Clash, Lucky Pick) are decided by the choice, not by who is faster.

## Tests and tools

```bash
node party/tests/sim.test.js                                   # 45 bots per minigame: ends, ranks, pays, renders
node party/tools/loadtest.js --bots 45 --games 6 --start --key KEY   # real socket.io phones
node party/tools/inspect.js --secs 300                          # what the pad really renders, box by box
node party/tools/capture.js --secs 120 --video out.mp4          # projector + phone capture
```

`loadtest` joins real clients, reads the same pad payload a phone gets and plays it — it is also how a live
party is staged for the projector capture.

## Two teams, and a look of its own (owner corrections, 2026-10-29)

**Two teams, always.** `الفيروز` (Turquoise, `#2fd0b4`, ◆) and `العنبر` (Amber, `#f6a93b`, ✦). Six was wrong: a hall
splits into two sides. The scoring (100/70), the scoreboard, the wheel, the slot (one reel per team, so two reels),
spotlight pairing (one player from each side), the admin team tools and the 3D props (two trays, two lanes, two jets,
two bridges) all assume two. `lib/sim.js` is the only place teams are defined; nothing else hard-codes a colour.

**Its own look.** `public/majlis.css` is the whole visual system — no ND96 class or component is reused. Deep indigo
night, brass, lantern gold, cream, Sadu red; a woven hem on team cards and the pad header; Baloo Bhaijaan 2 for
display and Tajawal for text, self-hosted in `public/vendor/`. The projector HUD is one glass header plate
(title · round · players/format/timer), two centred team cards, and a phase card that only appears when there is
something to say. `docs/DESIGN.md` holds the direction and the three art-direction frames it was chosen from.

**No DOM rebuilds.** Every phase panel, the scoreboard, the vote rail, the dart legend, the rule bar, the join line
and the admin roster are built once and then patched (text/attributes/classes only). Run the gate:

```
node party/tests/dom-stability.test.js 30     # host + pad + admin, live bots, MutationObserver
```

It fails if any element inside a persistent region is replaced while a phase is running; a phase change may build a
new phase card, nothing else may.

## Set, avatars and sound (Kenney CC0)

The room around the arena is furnished from the CC0 Kenney kits — see `public/assets/LICENSE.md`
for the exact files, their source packs and the restyling rules. `public/majlis-glb.js` loads them
once, remaps every material by name to the party palette, adds contact shadows and lantern light,
draws its own Sadu rug, and puts two team-tinted mini-character avatars on brass-rimmed plinths for
the finale. `public/majlis-audio.js` owns the wheel tick, the reel knocks and the finale stinger,
with a footer toggle (`mj_sound`) and a silent unlock on first touch.

Only the files in use are copied into `public/assets`; the library at `/opt/data/assets/kenney/`
is never edited in place.

## Round 6 — Gyro Darts (سهام المجلس)

The phone is the dart. Tilt it to aim and the projector's reticle follows; flick it forward and the phone decides the
throw, then sends **one** `dart` message. A slow network can delay the dart, never bend it: nothing about the landing
depends on round-trip time.

| | |
|---|---|
| Aim | `deviceorientation` (γ/β) → reticle in board coordinates |
| Throw | `devicemotion` acceleration spike → power; weak flick drops the dart low |
| No sensor | drag to aim, swipe to throw (power from the last 140 ms of travel) |
| iOS | one "السماح بالحركة" tap requests `DeviceOrientationEvent.requestPermission()` |
| Board | falcon-eye rings 50 · 25 · 20 · 15 · 10 · 5 (values in a side legend on the projector) |
| Pace | 3 darts per round × 3 rounds, 950 ms minimum between darts, 1.4 s settle at the start of a round |
| Formats | team relay, 1v1 spotlight, FFA — every dart is thrown in its own window |
| Score | ring points per player; team value = average per player; `+8 + total` per player |

Join: the projector's QR (`/qr.png`) encodes `/play?c=<code>`; the pad pre-fills the code, assigns a team and, when
someone scans **mid-party**, they get "الجولة القادمة — شاهد الشاشة" and are in the next round with a real control.
Reloading keeps the same `mj_token`, so a phone that sleeps does not become a second player.

## Round 5 — the four calm tilt games (WarioWare ideas, not WarioWare pacing)

| id | Arabic | idea taken | phone control | how it scores |
| --- | --- | --- | --- | --- |
| `marathon` | فرز الماراثون | "send it left or right" | two huge gate buttons | correct gates; team answer = majority of its thumbs |
| `qahwa` | صبّ القهوة | "POUR!" | tilt forward to pour, level to stop | distance from the gold line, 3 attempts, spill = 0 |
| `tray` | توازن الصينية | "BALANCE!" | counter-tilt | seconds the finjan spends in the green band |
| `datecatch` | اصطياد التمر | "CATCH!" | tilt to slide the basket | dates caught; six lanes on the projector |

Rules that keep them calm, per the owner's correction:

* Every game is a normal entry on the wheel — no rapid-fire mode, no speed ramp, no chaining.
* Each round has a fixed pace: `marathon` gives every animal the same 3.2 s and the rule changes twice,
  announced on the projector before it bites; `qahwa` pours at a constant rate; `tray` telegraphs every gust
  half a second ahead; `datecatch` drops one date every 1.15 s forever.
* Tilt is a velocity, not a position. The first build mapped tilt straight onto the basket's x, so it snapped
  to the edges and caught almost nothing; the fix is `x += gx * speed * dt`.
* Phones without a motion sensor, or with the permission refused, get a drag puck that sends the same
  messages; `qahwa` also has a hold-to-pour button.
