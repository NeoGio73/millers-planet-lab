// Physics model for the Miller's planet time dilation lab.
// One formula does the work: a clock at rest at distance r from a non-spinning black hole runs at
//     dτ/dt = sqrt(1 − r_s / r),        r_s = 2GM / c²
// compared with a clock far away (Earth). Distances are carried as x = r / r_s.

export const C = 299792458;             // m/s
export const G = 6.6743e-11;            // m³ kg⁻¹ s⁻²
export const M_SUN = 1.98847e30;        // kg
export const AU = 1.495978707e11;       // m
export const G_EARTH = 9.80665;         // m/s²
export const R_EARTH = 6.371e6;         // m
export const HOURS_PER_YEAR = 8766;     // Julian year
export const MINUTES_PER_YEAR = HOURS_PER_YEAR * 60;
export const DAYS_PER_YEAR = 365.25;

// Gargantua: 100 million solar masses (Kip Thorne, The Science of Interstellar)
export const GARGANTUA_SOLAR_MASSES = 1e8;
export const GARGANTUA_MASS = GARGANTUA_SOLAR_MASSES * M_SUN;
export const RS = (2 * G * GARGANTUA_MASS) / (C * C);       // Schwarzschild radius, m

// The film's number: one hour on Miller's planet is seven years on Earth.
export const SURFACE_FACTOR = 7 * HOURS_PER_YEAR;            // 61,362
// Where a clock at rest would have to sit for that factor, in units of r_s (a hair above 1).
export const X_PLANET = 1 / (1 - 1 / (SURFACE_FACTOR * SURFACE_FACTOR));
export const X_PLANET_EXCESS = 1 / (SURFACE_FACTOR * SURFACE_FACTOR - 1);   // x − 1, kept separately for precision

// Miller's planet: the film gives 130% of Earth's gravity; Thorne's book gives waves about 1.2 km tall.
export const MILLER_G = 1.3 * G_EARTH;
export const WAVE_HEIGHT = 1200;                             // m
export const WAVE_SPEED = Math.sqrt(MILLER_G * WAVE_HEIGHT); // long-wave speed sqrt(g h)

export const FILM_ROMILLY_YEARS = 23 + 4 / 12 + 8 / DAYS_PER_YEAR;   // "23 years, 4 months, 8 days"

export const DEFAULTS = {
  xE: 100,            // Endurance parking distance, in r_s
  descentMin: 40,     // Ranger time for the descent (a simulation choice; the film gives none)
  ascentMin: 40,
  surfaceMin: 200,    // 3 h 20 min on the surface
  waveKm: 20,         // distance to the wave when it is sighted
  planetRadius: 1.3,  // in Earth radii: Earth's density at 1.3 g
  tidalMassExp: 8,    // log10 of the black hole mass in solar masses, for the tidal demo only
};

/** Clock rate dτ/dt at distance x = r/r_s (1 = Earth's rate). */
export function rate(x) {
  return Math.sqrt(Math.max(0, 1 - 1 / x));
}

/** Antiderivative of sqrt(x / (x − 1)), which is 1/rate. F(1) = 0. */
export function F(x) {
  const xm = Math.max(0, x - 1);
  return Math.sqrt(x * xm) + Math.log(Math.sqrt(x) + Math.sqrt(xm));
}

/** Ranger distance during the descent, s from 0 (at the Endurance) to 1 (at the planet): a steady approach. */
export function xDescent(p, s) {
  return p.xE - (p.xE - X_PLANET) * s;
}

/**
 * Earth minutes that pass while the Ranger covers the first fraction s of the descent:
 *   Δt = ∫ dτ / sqrt(1 − r_s/r(τ))  with r falling linearly in τ, which integrates in closed form.
 */
export function earthMinutesDescent(p, s) {
  const x = xDescent(p, s);
  return (p.descentMin / (p.xE - X_PLANET)) * (F(p.xE) - F(x));
}

export function earthMinutesAscent(p, s) {
  const x = X_PLANET + (p.xE - X_PLANET) * s;
  return (p.ascentMin / (p.xE - X_PLANET)) * (F(x) - F(X_PLANET));
}

/**
 * State of the three clocks. phase: 'pre' | 'descent' | 'surface' | 'ascent' | 'done'; s is progress within the phase.
 * All times are minutes since the Ranger undocked.
 */
export function missionState(p, phase, s) {
  s = Math.min(1, Math.max(0, s));
  let tau = 0, earth = 0, x = p.xE, onSurface = false;
  const dFull = earthMinutesDescent(p, 1);
  const sFull = p.surfaceMin * SURFACE_FACTOR;
  if (phase === 'descent') {
    tau = p.descentMin * s; earth = earthMinutesDescent(p, s); x = xDescent(p, s);
  } else if (phase === 'surface') {
    tau = p.descentMin + p.surfaceMin * s; earth = dFull + sFull * s; x = X_PLANET; onSurface = true;
  } else if (phase === 'ascent') {
    tau = p.descentMin + p.surfaceMin + p.ascentMin * s;
    earth = dFull + sFull + earthMinutesAscent(p, s);
    x = X_PLANET + (p.xE - X_PLANET) * s;
  } else if (phase === 'done') {
    tau = p.descentMin + p.surfaceMin + p.ascentMin;
    earth = dFull + sFull + earthMinutesAscent(p, 1);
    x = p.xE;
  }
  const rateE = rate(p.xE);
  const rangerRate = onSurface || x <= X_PLANET * (1 + 1e-13) ? 1 / SURFACE_FACTOR : rate(x);
  return { phase, s, tau, earth, endurance: earth * rateE, x, rangerRate, enduranceRate: rateE, onSurface };
}

// ---- escape and orbit speeds --------------------------------------------------------------------------

export const V_ESC_EARTH = Math.sqrt(2 * G_EARTH * R_EARTH);        // m/s

/** Escape speed from Miller's planet for a radius given in Earth radii (surface gravity fixed at 1.3 g). */
export function vEscPlanet(radiusEarths) {
  return Math.sqrt(2 * MILLER_G * radiusEarths * R_EARTH);
}
/** Density of the planet relative to Earth's for that radius (g ∝ ρR). */
export function planetDensity(radiusEarths) {
  return 1.3 / radiusEarths;
}
/** Escape speed from Gargantua at x = r/r_s, as a fraction of c: sqrt(r_s/r). */
export function vEscGargantua(x) {
  return Math.sqrt(1 / x);
}
/** Circular orbit speed (Newtonian) at x, as a fraction of c. */
export function vOrbGargantua(x) {
  return Math.sqrt(1 / (2 * x));
}

// ---- the wave -----------------------------------------------------------------------------------------

/** Seconds until a wave sighted `km` away arrives. */
export function waveEtaSeconds(km) {
  return (km * 1000) / WAVE_SPEED;
}

/**
 * Tidal stretch across a width d (m) at distance x·r_s from a black hole of `solarMasses`:
 *   Δg ≈ |dg/dr| d = 2GM d / r³.   With r = x r_s this is c⁶ d / (4 G² M² x³): heavier holes are gentler.
 */
export function tidalAcceleration(solarMasses, x, d) {
  const M = solarMasses * M_SUN;
  const r = (x * 2 * G * M) / (C * C);
  return (2 * G * M * d) / (r * r * r);
}

// ---- formatting ---------------------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');

/** h:mm:ss for the Ranger's own clock. */
export function fmtHMS(minutes) {
  const total = Math.max(0, Math.round(minutes * 60));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

/** Adaptive duration for the far clocks: seconds up to years. */
export function fmtDuration(minutes) {
  const m = Math.max(0, minutes);
  if (m < 1 / 60) return '0 s';
  if (m < 2) return `${Math.round(m * 60)} s`;
  if (m < 120) {
    const whole = Math.floor(m), sec = Math.round((m - whole) * 60);
    return sec === 60 ? `${whole + 1} min 00 s` : `${whole} min ${pad2(sec)} s`;
  }
  const hours = m / 60;
  if (hours < 48) {
    const h = Math.floor(hours), mm = Math.round((hours - h) * 60);
    return mm === 60 ? `${h + 1} h 00 min` : `${h} h ${pad2(mm)} min`;
  }
  const days = hours / 24;
  if (days < 60) return `${days.toFixed(1)} days`;
  const years = days / DAYS_PER_YEAR;
  if (years < 1) return `${Math.round(days)} days`;
  return fmtYMD(years);
}

/** Years as "23 y 4 mo 8 d". */
export function fmtYMD(years, withDays = true) {
  let y = Math.floor(years + 1e-9);
  const monthsF = (years - y) * 12;
  let mo = Math.floor(monthsF + 1e-9);
  let d = Math.round((monthsF - mo) * (DAYS_PER_YEAR / 12));
  if (d >= 30) { d = 0; mo += 1; }
  if (mo >= 12) { mo = 0; y += 1; }
  return withDays ? `${y} y ${mo} mo ${d} d` : `${y} y ${mo} mo`;
}

export function fmtNumber(v, digits = 0) {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A rate such as 0.7071 or 1.63 × 10⁻⁵, as plain text. */
export function fmtRate(v) {
  if (v >= 0.001) return v.toFixed(4);
  const e = Math.floor(Math.log10(v));
  const mant = v / Math.pow(10, e);
  const sup = String(e).replace('-', '⁻').replace(/\d/g, (ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]);
  return `${mant.toFixed(2)} × 10${sup}`;
}
