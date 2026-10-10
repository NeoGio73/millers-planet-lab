# Mission to Miller's Planet: Time Dilation Lab

An interactive 3D simulation for a calculus-based college physics course, built around the Ranger's trip to Miller's planet in *Interstellar* (2014). Students follow the mission in six animated beats while a physics panel keeps three clocks running: the Ranger's crew, the Endurance in orbit, and Earth.

**Live page:** https://neogio73.github.io/millers-planet-lab/

| Beat | What happens | Physics tab |
|---|---|---|
| 1. Arrival | The Endurance parks far from Gargantua | Time dilation |
| 2. Descent | The Ranger falls toward the planet; Gargantua grows | Time dilation, Earth time as an integral |
| 3. Landing | Through the cloud deck to a shallow ocean | Time dilation |
| 4. The wave | A 1.2 km wave arrives and lifts the Ranger | Tidal acceleration, wave speed |
| 5. Ascent | Back up to the Endurance | Escape velocity |
| 6. Reunion | Docking: hours for the crew, 23 years for Romilly | Time dilation |

**Real time and ticks.** While the Ranger is on the surface (Landing and The wave), two buttons appear in the 3D view. *Real time* slows the scene to the crew's true pace, one second per second. *Ticks* adds a clock tick each time a day passes on Earth: every 86,400 s ÷ 61,362 = 1.41 s. The tick is generated in the browser; no audio from the film is used. Sound stays off until a student presses *Ticks*.

## Putting it in D2L

Students need a computer or tablet with a current browser (Chrome, Edge, Firefox or Safari). The first load is about 4 MB.

**Embed it in a content page.** In the HTML editor choose *Insert Stuff → Enter Embed Code* (or switch to the source view) and paste:

```html
<iframe src="https://neogio73.github.io/millers-planet-lab/"
        title="Mission to Miller's planet: time dilation lab"
        width="100%" height="820" style="border:0;"
        allow="fullscreen" allowfullscreen></iframe>
```

The page has its own *Full screen* button, which needs the `allow="fullscreen"` and `allowfullscreen` attributes above. Below 900 px wide, the physics panel moves under the 3D view and the page scrolls.

**Or link to it.** A quicklink or web link that opens in a new window gives students the most room.

## The physics model

Every clock uses the time dilation of a clock at rest near a non-spinning black hole:

dτ = dt √(1 − r<sub>s</sub>/r), with r<sub>s</sub> = 2GM/c²

- Gargantua: 10⁸ solar masses, so r<sub>s</sub> = 2.95 × 10⁸ km (about 2 AU).
- Miller's planet: the film's 1 hour = 7 years, a factor of 61,362. This model needs the planet within 2.7 × 10⁻¹⁰ r<sub>s</sub> of the horizon. Kip Thorne's real answer is a black hole spinning within about one part in 10¹⁴ of its maximum, which is beyond the course. The About box on the page says so.
- Endurance: parked at 100 r<sub>s</sub> by default (adjustable), where clocks run at 0.995.
- Descent and ascent: 40 minutes each on the Ranger's clock, with r falling linearly in τ. That turns the Earth-time integral into a closed form, shown in the panel. The trip is deliberately not to scale (it would need about 40c); the About box explains why that barely changes the answer.
- Escape speed, orbit speed and the tidal stretch are Newtonian estimates. The wave moves at the long-wave speed √(gh).

With the defaults (3 h 20 min on the surface), the trip takes 4 h 40 min for the crew, 23 y 2 mo 18 d for Romilly on the Endurance and 23 y 4 mo 0 d on Earth. The film's 23 years, 4 months, 8 days corresponds to 3 h 21 min on the surface.

### Questions to try with students

1. How close to Gargantua would the Endurance have to park for its clock to run at 90% of Earth's rate? Solve it, then check: the slider gives a rate just under 0.9 at 5 r<sub>s</sub> and just over at 6 r<sub>s</sub>, and hovering over the rate plot reads off any distance.
2. Differentiate √(x(x−1)) + ln(√x + √(x−1)) and confirm that it is the integrand in the panel.
3. Set the black hole to 10⁷ Suns. Why does a *lighter* black hole tear the planet apart?
4. Show that √(1 − v<sub>esc</sub>²/c²) equals the time dilation factor.
5. The ticks in the film's Miller's planet scene are often said to come every 1.25 s, one per day on Earth. With 1 hour = 7 years, how much Earth time does one 1.25 s tick really stand for? (The simulation ticks every 1.41 s.)

## Editing it

The page is plain HTML, CSS and JavaScript. The source is in `src/` and is bundled into `app.js`:

```sh
npm install
npm run build      # writes app.js
npx serve .        # or any static web server, then open http://localhost:3000
```

| File | What it holds |
|---|---|
| `src/physics.js` | Constants, the clock model, escape speed, tides, wave speed and number formatting |
| `src/director.js` | The six beats: timing, captions, ship and camera paths |
| `src/space.js` | Stars, Gargantua, Miller's planet, the Endurance and the Ranger in orbit |
| `src/surface.js` | The ocean, the wave, the cloud deck and the spray |
| `src/panel.js` | The physics panel: clocks, tabs, sliders and the rate plot |
| `src/main.js` | Loading, rendering, controls, real time and ticks, and the labels in the 3D view |
| `src/audio.js` | The clock tick, made with the Web Audio API |

To change the captions or beat lengths, edit `BEATS` in `src/director.js`. To change a default (surface time, parking orbit and so on), edit `DEFAULTS` in `src/physics.js`. Then run `npm run build`.

## Credits

An unofficial educational simulation inspired by *Interstellar* (2014); not affiliated with or endorsed by its makers. Physics background: Kip Thorne, *The Science of Interstellar* (2014). The Ranger, the Endurance and the black hole scene behind the Gargantua render are open-licensed 3D models; Miller's planet was made in Blender for this project.

Built with [three.js](https://threejs.org) and [KaTeX](https://katex.org) (MIT licences), and the Barlow Semi Condensed and IBM Plex Mono fonts (SIL Open Font Licence). The licence texts are in `licenses/`.
