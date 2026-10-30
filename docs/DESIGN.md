# Majlis Party — design (v2, standalone)

Majlis Party is its own game. One projector, 20–45 phones, exactly two teams, one host key. It shares
nothing with any other title: not its code, not its palette, not its camera, not its characters.

## 1. Goal

A room of forty people is shouting at a projector within ninety seconds of the QR going up and is still
shouting forty minutes later. Two sides, one screen, a phone in every hand that always has something to press.

- Audience: a Saudi majlis full of guests, mixed ages, phones on 4G over one hotspot.
- Phone: scan → nickname → tap. Nothing to install, nothing to read.
- Projector: legible from the back row of a 40-person room, at 16:9.

## 2. The night, in one sentence

**A toy diorama of a majlis at night: pomegranate Sadu rugs, brass lantern light, chunky wooden characters
in thobes with team-coloured scarves, and a board of golden dallahs that both teams walk around.**

Rejected alternative: "neon souq" (glowing signage, dark chrome, bloom). It reads as a nightclub, fights the
phone screens in the room, and is the fastest way back to looking like every other projector game.

## 3. Identity

- **Wordmark** `مجلس بارتي` in Baloo 800, cream, with a brass lantern glyph holding a mint star; English
  `MAJLIS PARTY` underneath, tracked, small. The lantern hangs from the top edge of the header.
- **Palette**
  - night `#0B1626`, night-2 `#122438`, night-3 `#1B3350`
  - rug `#7A1D3B`, rug-deep `#541228`
  - brass `#F0AE4C`, lamp `#FFD79A`
  - cream `#FBF0DA`, cream-dim `rgba(251,240,218,.72)`
  - team mint `#3ED9B0` / dark `#0C5F4E`; team coral `#FF7A5C` / dark `#7C2430`
- **Type**: Baloo 800 (display, Arabic + Latin) and Tajawal 700/900 (UI). Arabic-Indic digits on the
  projector; Latin digits only where a phone keypad needs them.
- **Shapes**: every surface is a *cushion* — 26–34 px radius, 2 px cream edge, an inner stitched dashed line,
  a brass stud in each corner. Panels hang from the top edge with two small brass rings. Dividers are Sadu
  zigzags, never straight rules.
- **Sound** (synthesised, no samples): brass chime on a good tap, cushion thump on a landing, dallah pour in
  the last three seconds, coin clink for a purchase, drum for Ardah. A sound toggle sits in the footer,
  defaults on, remembers the choice.
- **Motion**: always on, never removed. Lanterns sway (±3°, 6 s), lamp glow breathes (4 s), the wheel spins
  with a decelerating tick, tokens hop space to space, coins arc to the team plate, result cards land with a
  small overshoot. Nothing flashes more than three times per second.

## 4. One character, everywhere

A single chibi rig, used for the lobby crowd, the play floor, the board tokens and the podium — same
proportions, same face, same thobe; only the scarf and the ghutra band take the team's colour:

- tapered thobe, two arms, a head at ~42 % of body height, a ghutra dome with a brass iqal, a scarf ring at
  the neck, and a soft contact shadow.
- faces are painted once on a canvas texture — two eyes, a smile, a moustache on some, a beard on others — and
  reused at every scale, so the character on the board is recognisably the one on the podium.
- built from instanced parts: 7 draw calls for 45 characters.
- no capsules, no featureless spheres, no GLB avatars in a different art language.

## 5. Camera rules

- Action fills the middle 70 % of the frame; the floor never takes more than half the frame height.
- The play-floor camera sits low (14° above the rug) and close (≈ 19 units), so 45 characters read as bodies,
  not specks.
- Nothing is cut off at 16:9: a 6 % safe margin inside the HUD, and no prop crosses the frame edge.
- Every phase has its lens: the board is a top-down doll-house shot, the podium a low warm two-shot.

## 6. The loop

```
lobby → board(wheel → slot → minigame → results → board move) × N → podium
```

- **Board**: a woven rug road of 16 spaces across the projector. Two tokens. Spaces: coins, golden dallah
  (star), chaos card, event, shop, swap. A fork at space 7 where both phones vote for the shortcut or the long
  rug (8 s, majority, shown live on the projector).
- **Dice**: the winner of a minigame rolls 2 dice and keeps the best; the loser rolls 1. A golden dallah is
  taken on a star space. Ten coins buy one at the shop.
- **Win**: most golden dallahs after the last board turn; coins break the tie.
- **Wheel**: every minigame on a brass wheel, no repeat inside the last four; the host can respin.
- **Name slot machine**: one reel per team, drawn from the fair picker (§8).
- **Session length** in the lobby: short (5 minigames ≈ 20 min) or standard (9 ≈ 40 min).

## 7. Readability for forty people

- One number per team at any moment: the golden-dallah count on the team plate. Minigame points are not a
  second currency — they only set the dice, so there is never a second scoreboard to explain.
- Player counts come from one function (`connected()`); no component counts players itself.
- Rule cards are three lines, five seconds, with the phone control drawn as an icon.
- Every phone is live: a control in its round, a team cheer button when it is not its turn, a vote on a board
  turn.

## 8. Fair picker (party-wide)

One pool of "who has not had a turn yet". Every turn-based or spotlight game draws **randomly** from the
not-yet-picked pool; nobody repeats until everyone present has had a turn. Late joiners enter the pool; AFK
players are skipped and stay in it. The draw is announced with the slot machine and a phone buzz. Test: 45
bots, 10 games, report min/max turns per player.

## 9. Content

The 23 inherited minigames are re-rated for fun with two teams on phones in `GAMES.md`: keep / improve / cut,
one line of reasoning each. Weak ones are cut or reworked. Eight new games are added, all two-team,
phone-native and lag-tolerant: Rope Pull, Balloon Darts, Musical Cushions, Paint the Majlis, Crown Chase,
Count the Camels, Red Light Green Light, Ardah Rhythm. Balloon Pump is reworked to alternating team turns with
two phone buttons (Tap to pump / End turn) and a big, tense balloon. Target ≈ 25 games that are genuinely fun.

## 10. Toolchain

- Node + socket.io + qrcode; server-authoritative sims in `games/*.js`, one contract per game.
- Projector: three.js (`public/host-scene.js`) with the lantern-night set, one instanced character rig.
- Phone: DOM pad (`public/play.js`), built once, patched by text/attribute (MutationObserver gate).
- Assets: Kenney CC0 props (restyled) plus our own canvas textures; fonts local; audio synthesised in
  WebAudio; no CDN at runtime.
- Staging: `node server.js` on port 9520 behind its own tunnel; nothing else is touched.

## 11. Acceptance

1. `npm test` passes: sim gate over every game, pad-sync, DOM stability, picker.
2. `grep -ri nd96` finds one provenance line in README only.
3. At 1920×1080 and 1280×720 nothing is clipped, no card covers the podium, the play floor is filled.
4. A phone that joins mid-round gets a live control (or an explicit cheer) the same second.
5. The board turn is understandable with the sound off and no host explaining.
6. 90 s film: lobby → board → wheel → two minigames → podium, projector and phone side by side.

## 12. Assumptions

- Arabic-first UI with English subtitles; the host is a laptop on HDMI, not a touch device.
- Exactly two teams, auto-balanced, players may switch side in the lobby.
- No difficulty ramp inside a round and no rapid-fire chain: calm, readable rounds (owner rule).
- Phones are on one Wi-Fi/hotspot; 150–500 ms latency is normal and must not decide a round.
