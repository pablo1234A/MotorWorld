/**
 * Catalogue. Every figure is fictional. `render` holds the parameters the procedural
 * 3D generator uses (tools/render.mjs) to produce the placeholder stills in
 * public/assets/villas/<slug>/ — drop real photography over those files to replace them.
 */

const BASE = {
  wall: '#e8e0d0', concrete: '#c9c1b2', timber: '#8a6a4a', timberDark: '#5c4630', floor: '#d6cebf',
  terrace: '#e8dcc3', oak: '#b79a76', stoneDark: '#4a4540', linen: '#d9d0bf', accent: '#a9674a',
  leaf: '#6f8a4f', leafDark: '#4b6b3d', water: '#4fc4c8', waterGlow: '#3ee2ee', waterBottom: '#47b5bb',
  drive: '#b8ad99', artA: '#d3c5ad', artB: '#2d3b3a', artC: '#a55d3f',
  veg: 'mixed', pergola: false, wing: false,
};
const TERRAIN = { kind: 'cliff', seaLevel: -18, grass: '#7f8b55', rock: '#8b7f6d', sand: '#d8c9a7', dry: '#a99b6c', lawn: '#8d9a5d' };

const make = (seed, over = {}, terrain = {}) => ({
  ...BASE, ...over, seed,
  terrainCfg: { ...TERRAIN, seed, ...terrain },
});

export const VILLAS = [
  {
    slug: 'villa-aurelia',
    name: 'Villa Aurelia',
    place: 'Marbella', region: 'Costa del Sol, Spain', country: 'Spain',
    type: 'Contemporary', price: 14800000, area: 780, plot: 3200, beds: 5, baths: 7, year: 2023,
    tag: 'Signature residence',
    blurb: 'Two storeys of glass and travertine hung over the Mediterranean, with a 24-metre infinity pool that disappears into the horizon.',
    description: [
      'Aurelia was drawn around a single idea: that the sea should be the first room you see and the last one you leave. A cantilevered upper floor shelters a covered terrace, while the ground floor opens entirely onto a travertine deck and an infinity pool that runs flush with the cliff edge.',
      'Inside, the house is calm and generous. A timber-slatted screen separates the entrance hall from a double-aspect salon; a floating oak stair lifts you to the principal suite, whose bath is set against the glass like a pavilion.',
    ],
    features: ['24 m infinity pool', 'Private garage for six cars', 'Wine cellar and tasting room', 'Home cinema', 'Staff apartment', 'Smart-home and security'],
    highlights: [{ n: 780, u: 'm²', l: 'Built area' }, { n: 5, u: '', l: 'Bedrooms' }, { n: 7, u: '', l: 'Bathrooms' }, { n: 3200, u: 'm²', l: 'Private plot' }],
    view: 'Open Mediterranean', coords: { lat: '36.50° N', lon: '4.95° W' },
    pois: [
      { name: 'Playa de Cabopino', km: 2.1, bearing: 200, kind: 'Beach' },
      { name: 'Puerto Banús', km: 7.4, bearing: 250, kind: 'Marina' },
      { name: 'Real Club Valderrama', km: 18, bearing: 120, kind: 'Golf' },
      { name: 'Marbella Old Town', km: 9.2, bearing: 280, kind: 'Town' },
      { name: 'Málaga Airport', km: 52, bearing: 60, kind: 'Airport' },
      { name: 'Nobu Marbella', km: 8.1, bearing: 265, kind: 'Dining' },
    ],
    render: make(11, { veg: 'mixed' }),
    heroShot: 'hero',
  },
  {
    slug: 'casa-onix',
    name: 'Casa Ónix',
    place: 'Sant Josep', region: 'Ibiza, Balearic Islands', country: 'Spain',
    type: 'Cliffside', price: 9400000, area: 540, plot: 2100, beds: 4, baths: 5, year: 2021,
    tag: 'Sunset coast',
    blurb: 'A dark, sculpted house on the west coast of Ibiza, built to frame the sunset from every principal room.',
    description: [
      'Casa Ónix trades the white-cube cliché for volumes in deep charcoal lime plaster, softened by warm timber and a pergola that throws long shadows across the pool terrace.',
      'The west-facing terraces are set a metre below the garden, so the sunset arrives at eye level over the water.',
    ],
    features: ['Pergola terrace', 'Sunset lounge', 'Saltwater pool', 'Outdoor kitchen', 'Guest studio', 'Solar and battery storage'],
    highlights: [{ n: 540, u: 'm²', l: 'Built area' }, { n: 4, u: '', l: 'Bedrooms' }, { n: 5, u: '', l: 'Bathrooms' }, { n: 2100, u: 'm²', l: 'Private plot' }],
    view: 'West-facing, sunset over Es Vedrà', coords: { lat: '38.93° N', lon: '1.28° E' },
    pois: [
      { name: 'Cala Comte', km: 3.4, bearing: 210, kind: 'Beach' },
      { name: 'Sant Antoni Marina', km: 9.8, bearing: 330, kind: 'Marina' },
      { name: 'Club de Golf Ibiza', km: 17, bearing: 80, kind: 'Golf' },
      { name: 'Ibiza Town', km: 15, bearing: 70, kind: 'Town' },
      { name: 'Ibiza Airport', km: 14, bearing: 95, kind: 'Airport' },
      { name: 'Sunset Ashram', km: 6.0, bearing: 300, kind: 'Dining' },
    ],
    render: make(23, { wall: '#4a4845', concrete: '#35332f', timber: '#8d6240', timberDark: '#4d3321', floor: '#8c867b', terrace: '#b9b1a1', accent: '#c07a4d', veg: 'olive', pergola: true, leaf: '#7d8c52', drive: '#8b8274' },
      { grass: '#8a8a55', dry: '#b09a63', lawn: '#9a9a62', seaLevel: -22 }),
    heroShot: 'heroW',
  },
  {
    slug: 'son-alba',
    name: 'Son Alba',
    place: 'Deià', region: 'Serra de Tramuntana, Mallorca', country: 'Spain',
    type: 'Estate', price: 11200000, area: 690, plot: 18500, beds: 6, baths: 7, year: 2019,
    tag: 'Mountain estate',
    blurb: 'A restored stone finca in the Tramuntana, reimagined with a modern wing, terraced olive groves and a view down to the sea.',
    description: [
      'Son Alba keeps what is worth keeping: three-century-old sandstone walls, deep window reveals, a courtyard shaded by a single fig tree. Around it, a quiet modern wing adds the large rooms and the light the original house never had.',
      'Eighteen thousand square metres of terraced olive groves fall away toward the Mediterranean.',
    ],
    features: ['Restored 18th-century finca', 'Olive grove and orchard', 'Heated 18 m pool', 'Guest wing', 'Yoga pavilion', 'Private helipad access'],
    highlights: [{ n: 690, u: 'm²', l: 'Built area' }, { n: 6, u: '', l: 'Bedrooms' }, { n: 7, u: '', l: 'Bathrooms' }, { n: 18500, u: 'm²', l: 'Estate' }],
    view: 'Mountains to sea', coords: { lat: '39.75° N', lon: '2.65° E' },
    pois: [
      { name: 'Cala Deià', km: 1.6, bearing: 330, kind: 'Beach' },
      { name: 'Port de Sóller', km: 9.5, bearing: 40, kind: 'Marina' },
      { name: 'Golf de Andratx', km: 28, bearing: 210, kind: 'Golf' },
      { name: 'Palma de Mallorca', km: 28, bearing: 160, kind: 'Town' },
      { name: 'Palma Airport', km: 36, bearing: 165, kind: 'Airport' },
      { name: 'Es Racó d’es Teix', km: 0.9, bearing: 90, kind: 'Dining' },
    ],
    render: make(37, { wall: '#d6c3a0', concrete: '#b9a98a', timber: '#7a5638', timberDark: '#4e3622', floor: '#cdbf9f', terrace: '#d4c6a3', accent: '#8f5a3a', veg: 'cypress', wing: true, leaf: '#8a9558', leafDark: '#4f6a3a', drive: '#b2a384', artA: '#d8ccb3', artB: '#5c4b36', artC: '#8c4b2f' },
      { kind: 'hills', seaLevel: -60, grass: '#7e8a52', dry: '#a5a064', lawn: '#8a9658', rock: '#988b72' }),
    heroShot: 'heroHigh',
  },
  {
    slug: 'quinta-do-mar',
    name: 'Quinta do Mar',
    place: 'Vale do Lobo', region: 'Algarve, Portugal', country: 'Portugal',
    type: 'Beachfront', price: 6950000, area: 460, plot: 1800, beds: 4, baths: 5, year: 2022,
    tag: 'Steps to the sand',
    blurb: 'A pale, low-slung house on the Algarve dunes, with a private path to the beach and a pool that mirrors the Atlantic.',
    description: [
      'Quinta do Mar is built low and long, so the dunes remain the tallest thing in the view. White lime render, bleached oak and large sliding doors dissolve the line between terrace and sand.',
      'A private boardwalk leads to the beach in under two minutes.',
    ],
    features: ['Private beach access', 'Outdoor shower pavilion', 'Padel court', 'Sauna and cold plunge', 'Rooftop lounge', 'EV charging'],
    highlights: [{ n: 460, u: 'm²', l: 'Built area' }, { n: 4, u: '', l: 'Bedrooms' }, { n: 5, u: '', l: 'Bathrooms' }, { n: 1800, u: 'm²', l: 'Private plot' }],
    view: 'Atlantic, direct beach', coords: { lat: '37.04° N', lon: '8.05° W' },
    pois: [
      { name: 'Praia do Vale do Lobo', km: 0.2, bearing: 190, kind: 'Beach' },
      { name: 'Vilamoura Marina', km: 12, bearing: 280, kind: 'Marina' },
      { name: 'Royal Golf Course', km: 1.5, bearing: 110, kind: 'Golf' },
      { name: 'Loulé', km: 14, bearing: 20, kind: 'Town' },
      { name: 'Faro Airport', km: 17, bearing: 80, kind: 'Airport' },
      { name: 'Ocean Restaurant', km: 3.2, bearing: 100, kind: 'Dining' },
    ],
    render: make(51, { wall: '#f1ece1', concrete: '#d6d0c3', timber: '#a8896a', timberDark: '#6e5a45', floor: '#e1dacb', terrace: '#e9e2d2', oak: '#cdb895', accent: '#6f8a8c', veg: 'palm', leaf: '#8fa66a', leafDark: '#5c7a4c', water: '#59cfd1', drive: '#cbc2ad' },
      { kind: 'beach', seaLevel: -3, sand: '#e2d3ae', grass: '#b2ae75', dry: '#cdbf90', lawn: '#c6bb8f', rock: '#a09378' }),
    heroShot: 'heroLow',
  },
  {
    slug: 'le-belvedere',
    name: 'Le Belvédère',
    place: 'Cap-d’Ail', region: 'French Riviera, Monaco border', country: 'Monaco',
    type: 'Cliffside', price: 32000000, area: 920, plot: 2800, beds: 6, baths: 8, year: 2024,
    tag: 'Riviera landmark',
    blurb: 'The most vertical house in the collection: a clifftop villa that looks across the bay to Monaco from three terraced levels.',
    description: [
      'Le Belvédère stands one cliff-face above the harbour, looking directly across to the Rock. Its stacked terraces step down toward the water, each with its own garden and its own view.',
      'Interiors are reserved: pale stone, smoked oak, bronze. The skyline does the decorating.',
    ],
    features: ['Panoramic lift to every level', 'Private funicular to the sea', 'Rooftop pool and bar', 'Concierge-ready staff quarters', 'Panic room', 'Helipad rights'],
    highlights: [{ n: 920, u: 'm²', l: 'Built area' }, { n: 6, u: '', l: 'Bedrooms' }, { n: 8, u: '', l: 'Bathrooms' }, { n: 2800, u: 'm²', l: 'Private plot' }],
    view: 'Across the bay to Monaco', coords: { lat: '43.72° N', lon: '7.40° E' },
    pois: [
      { name: 'Plage Mala', km: 0.6, bearing: 180, kind: 'Beach' },
      { name: 'Port Hercule, Monaco', km: 3.0, bearing: 70, kind: 'Marina' },
      { name: 'Monte-Carlo Golf Club', km: 11, bearing: 20, kind: 'Golf' },
      { name: 'Monte Carlo Casino', km: 3.4, bearing: 65, kind: 'Town' },
      { name: 'Nice Côte d’Azur Airport', km: 22, bearing: 280, kind: 'Airport' },
      { name: 'Le Louis XV', km: 3.5, bearing: 66, kind: 'Dining' },
    ],
    render: make(63, { wall: '#d9d6cf', concrete: '#bbb7ae', timber: '#6b5038', timberDark: '#3f2e1e', floor: '#cfcbc2', terrace: '#dcd8cf', accent: '#7a6a55', veg: 'cypress', leaf: '#6b8a58', leafDark: '#3f5e3d', water: '#4bbec7', drive: '#a8a398' },
      { seaLevel: -42, grass: '#6d8556', dry: '#9a9a6a', lawn: '#7a915f', rock: '#8c8a82' }),
    heroShot: 'heroHigh',
  },
  {
    slug: 'palm-crescent',
    name: 'Palm Crescent',
    place: 'Palm Jumeirah', region: 'Dubai, United Arab Emirates', country: 'UAE',
    type: 'Beachfront', price: 18500000, area: 1150, plot: 2400, beds: 7, baths: 9, year: 2022,
    tag: 'Island waterfront',
    blurb: 'A sand-toned waterfront palace on the Crescent, with a 60-metre private beach and an unobstructed skyline at dusk.',
    description: [
      'Palm Crescent is the largest house in the collection and the most generous: seven suites, a majlis for forty, a wellness floor and a private beach with its own jetty.',
      'The architecture is deliberately quiet — pale sandstone, deep overhangs, courtyards that stay cool in August.',
    ],
    features: ['60 m private beach and jetty', 'Majlis for 40 guests', 'Wellness floor with hammam', 'Seven-car showroom garage', 'Staff villa', 'Full home automation'],
    highlights: [{ n: 1150, u: 'm²', l: 'Built area' }, { n: 7, u: '', l: 'Bedrooms' }, { n: 9, u: '', l: 'Bathrooms' }, { n: 60, u: 'm', l: 'Private beach' }],
    view: 'Gulf and Dubai skyline', coords: { lat: '25.12° N', lon: '55.13° E' },
    pois: [
      { name: 'Private beach', km: 0.1, bearing: 180, kind: 'Beach' },
      { name: 'Dubai Marina', km: 6.5, bearing: 150, kind: 'Marina' },
      { name: 'Emirates Golf Club', km: 11, bearing: 120, kind: 'Golf' },
      { name: 'Downtown Dubai', km: 25, bearing: 70, kind: 'Town' },
      { name: 'Dubai International', km: 32, bearing: 60, kind: 'Airport' },
      { name: 'Atlantis, The Palm', km: 5.0, bearing: 30, kind: 'Dining' },
    ],
    render: make(77, { wall: '#e6d7ba', concrete: '#cdbd9d', timber: '#7b5a3c', timberDark: '#4a3523', floor: '#dccdb0', terrace: '#e8dbc0', oak: '#c0a47c', accent: '#b08a55', veg: 'palm', leaf: '#8fa05a', leafDark: '#5c7840', water: '#43c9cc', drive: '#cbbd9f', wing: true },
      { kind: 'dunes', seaLevel: -2.5, sand: '#e5d4ac', grass: '#c4b87c', dry: '#d9c895', lawn: '#d6c597', rock: '#b4a581' }),
    heroShot: 'heroPool',
  },
  {
    slug: 'finca-sereno',
    name: 'Finca Sereno',
    place: 'Benahavís', region: 'Costa del Sol, Spain', country: 'Spain',
    type: 'Estate', price: 5200000, area: 620, plot: 9800, beds: 5, baths: 6, year: 2018,
    tag: 'Golf valley',
    blurb: 'A serene hillside estate between three golf courses, framed by olive trees and a long timber pergola.',
    description: [
      'Finca Sereno sits in the quiet valley behind the coast, where the air is cooler and the views run uninterrupted to the sea. The house is arranged around a long pergola-shaded terrace, designed for lunches that finish at dusk.',
      'Three golf courses lie within ten minutes.',
    ],
    features: ['Pergola terrace for 20', 'Olive grove', 'Tennis court', 'Heated infinity pool', 'Gym and spa', 'Two-bedroom guest house'],
    highlights: [{ n: 620, u: 'm²', l: 'Built area' }, { n: 5, u: '', l: 'Bedrooms' }, { n: 6, u: '', l: 'Bathrooms' }, { n: 9800, u: 'm²', l: 'Estate' }],
    view: 'Valley and sea', coords: { lat: '36.52° N', lon: '5.04° W' },
    pois: [
      { name: 'Playa de Estepona', km: 14, bearing: 190, kind: 'Beach' },
      { name: 'Puerto Banús', km: 15, bearing: 120, kind: 'Marina' },
      { name: 'La Zagaleta Golf', km: 3.0, bearing: 60, kind: 'Golf' },
      { name: 'Benahavís village', km: 2.4, bearing: 340, kind: 'Town' },
      { name: 'Málaga Airport', km: 62, bearing: 80, kind: 'Airport' },
      { name: 'Restaurante El Cenachero', km: 2.6, bearing: 340, kind: 'Dining' },
    ],
    render: make(89, { wall: '#d0c8b6', concrete: '#b3ab98', timber: '#7e5b3a', timberDark: '#503821', floor: '#c8bfaa', terrace: '#d6cdb7', accent: '#8d6840', veg: 'olive', pergola: true, leaf: '#7f9158', leafDark: '#52703f', drive: '#b0a68f', artB: '#3f4a38' },
      { kind: 'hills', seaLevel: -70, grass: '#76854e', dry: '#a39a5f', lawn: '#869559' }),
    heroShot: 'hero',
  },
  {
    slug: 'casa-duna',
    name: 'Casa Duna',
    place: 'Comporta', region: 'Alentejo coast, Portugal', country: 'Portugal',
    type: 'Beachfront', price: 7800000, area: 380, plot: 4200, beds: 4, baths: 4, year: 2023,
    tag: 'Barefoot luxury',
    blurb: 'A weathered-timber retreat in the Comporta dunes, hidden among pines and a long walk from anywhere else.',
    description: [
      'Casa Duna is an argument for restraint. Silvered timber, rammed earth and pale lime keep the house the colour of the dunes around it; the pool is a long, still rectangle among the pines.',
      'There is no street. There is a sand track, and then there is the Atlantic.',
    ],
    features: ['Rammed-earth construction', 'Pine-forest setting', 'Outdoor fire pit', 'Bicycles and horses on request', 'Off-grid solar', 'Beach club access'],
    highlights: [{ n: 380, u: 'm²', l: 'Built area' }, { n: 4, u: '', l: 'Bedrooms' }, { n: 4, u: '', l: 'Bathrooms' }, { n: 4200, u: 'm²', l: 'Private plot' }],
    view: 'Dunes and Atlantic', coords: { lat: '38.38° N', lon: '8.78° W' },
    pois: [
      { name: 'Praia da Comporta', km: 1.1, bearing: 230, kind: 'Beach' },
      { name: 'Troia Marina', km: 19, bearing: 330, kind: 'Marina' },
      { name: 'Comporta Dunes Golf', km: 2.8, bearing: 120, kind: 'Golf' },
      { name: 'Comporta village', km: 3.2, bearing: 90, kind: 'Town' },
      { name: 'Lisbon Airport', km: 105, bearing: 330, kind: 'Airport' },
      { name: 'Museu do Arroz', km: 3.4, bearing: 90, kind: 'Dining' },
    ],
    render: make(97, { wall: '#d8cfbc', concrete: '#bbb2a0', timber: '#9a9283', timberDark: '#625d52', floor: '#cfc6b3', terrace: '#ddd4c0', oak: '#bfae93', accent: '#7e8f7c', veg: 'olive', pergola: true, leaf: '#8a9a62', leafDark: '#5f7447', water: '#58c6c6', drive: '#c8bda6' },
      { kind: 'dunes', seaLevel: -3, sand: '#e1d3ae', grass: '#b5b27a', dry: '#d0c08d', lawn: '#cdbf93', rock: '#b0a384' }),
    heroShot: 'heroLow',
  },
];

export const bySlug = (slug) => VILLAS.find((v) => v.slug === slug);

export const LOCATIONS = [...new Set(VILLAS.map((v) => v.country))];
export const TYPES = [...new Set(VILLAS.map((v) => v.type))];

/** Stills generated per villa (see tools/render.mjs). */
export const GALLERY = [
  { key: 'living', label: 'Salon' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'suite', label: 'Principal suite' },
  { key: 'bath', label: 'Bathroom' },
  { key: 'terrace', label: 'Terrace' },
  { key: 'pool', label: 'Pool' },
];
