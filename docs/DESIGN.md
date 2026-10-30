# Majlis Party — its own look

Owner: *"The UI looks exactly like ND96, I don't like that."* So the party gets a visual system of its own. Logic can be
shared with the race app; **nothing visual is**: no ND96 palette, no Kufi/Plex pairing, no chip-and-panel language.

## What it must do

1. Read from the back of a 20–45 phone hall on a projector — one loud focal point per phase.
2. Feel like a warm night majlis, not a race HUD: brass, lantern light, Sadu weave, cushions, carpet.
3. Work on a phone in one hand, with a thumb.
4. Be its own thing at a glance: you should be able to tell a Majlis Party screenshot from an ND96 one instantly.

## Non-negotiables (from the corrections)

- **Two teams.** Two identities, not six colours. Big names, big crests, big scores.
- Calm pacing: nothing flashes faster than 3/s; no rapid-fire microgame feel.
- Arabic-first, RTL, Arabic-Indic digits on the projector.

## Direction: the three frames

Three frames were rendered from the same component set (`docs/design/frame-a|b|c.png`) so the choice is about art
direction, not about features.

### A — Night Tent, Brass & Lantern-Glow
Deep indigo ground (`#171331`), one warm lantern pool behind the action, brass rules (`#c99441`), cards float on a
lighter indigo (`#241c46`) with a woven cream hem. Gold display type, generous air. Quiet, expensive, very "night in
the majlis".

### B — Sawt Al-Sadu (flat weave)
Charcoal ground with loud Sadu bands (red `#b93a2e` / black / cream) used as structural blocks, cream cards, hard
brass outlines, flat illustration. Graphic and punchy from 20 m; risks looking like a poster rather than a party.

### C — Qahwa House
Warm brown-black (`#221a16`), amber pools, carpet texture behind everything, brass-framed cards, cream type with red
accents. Cozy and warm; the texture competes with small text and reads muddy on a cheap projector.

## Choice: A — Night Tent, Brass & Lantern-Glow
It carries the majlis feeling (brass, weave hem, lantern light) without texture noise, and its dark indigo ground gives
both team colours room to shout. B's Sadu bands are kept as a *trim motif* (scoreboard hems, wheel rim, phone header)
rather than as the whole surface; C's warmth is kept as the lantern pool behind the stage.

## The system

| Token | Value | Use |
|---|---|---|
| `--night` | `#14102b` | page ground |
| `--night-2` | `#1d1740` | panels, cards |
| `--night-3` | `#2a2154` | raised elements, wheel face |
| `--brass` | `#c99441` | rules, rims, frames |
| `--lantern` | `#ffc96b` | light, highlights, timer |
| `--cream` | `#f6ead2` | primary type |
| `--sadu-red` | `#b3382e` | weave trim, alerts, team B |
| `--team-a` | `#2fd0b4` turquoise | فريق الفيروز |
| `--team-b` | `#f6a93b` amber | فريق العنبر |

Type: **Baloo Bhaijaan 2** (rounded Arabic display, 600/800) for names, scores, titles; **Tajawal** (400/700/900) for
body, labels, buttons. Both self-hosted in `party/public/vendor/`.

Shape language: 22–28 px radius, brass 1.5 px rim, a 6 px woven hem at the top of every team card (Sadu stripes in
that team's colour), soft lantern shadow (`0 24px 70px rgba(0,0,0,.55)`) instead of ND96's flat green chips.

Motion: one slow reveal per phase (`scale .96 → 1`, 420 ms, `cubic-bezier(.2,1.15,.35,1)`); the wheel turns on a
brass ring with the games as lantern tags; no flashing, no shake, no colour strobing.

## Components

- **Header**: title lockup left (majlis wordmark + "MAJLIS PARTY"), round timer badge right shaped like a lantern,
  phase chip between them.
- **Scoreboard**: exactly two wide cards at the bottom, each with a woven hem, crest, name, score in display type and a
  thin progress ribbon showing the gap.
- **Wheel**: a brass ring with a Sadu-patterned face, game tags as small brass plates, one pointer lantern at the top.
- **Slot**: two carpet-strip reels (one per team), each with the team's crest at the top, names scrolling.
- **Cards** (announce/results/final): cream-on-indigo with a woven border, headline in Baloo, body in Tajawal.
- **Phone pad**: same palette, big thumb targets, the team crest in the header, the control card lifted on brass.
