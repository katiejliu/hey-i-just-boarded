require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ── Bluesky Configuration ────────────────────────────────────────────
// No API key needed! Bluesky's public API is free and open.
const BLUESKY_SEARCH_URL = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';

// ── Reddit Configuration ─────────────────────────────────────────────
// Public JSON API, no auth needed. Append .json to any Reddit URL.
const REDDIT_SEARCH_URL = 'https://www.reddit.com/search.json';
const REDDIT_SEARCH_QUERIES = [
  'landed in seattle',
  'arrived in seattle',
  'arriving in seattle',
  'leaving seattle',
  'left seattle',
  'flying to seattle',
  'flying out of seattle',
  'made it to seattle',
  'just got to seattle',
  'goodbye seattle',
  'sea-tac',
  'seatac airport',
  'seattle is home',
  'home in seattle',
  'back home seattle',
  'love seattle',
  'miss seattle',
  'moving to seattle',
  'moved to seattle',
  'relocating to seattle',
  'new to seattle',
  'just moved seattle',
  'moving away from seattle',
];
let redditQueryIndex = 0;
const REDDIT_USER_AGENT = 'Mozilla/5.0 (compatible; sea-flight-tracker/1.0)';

const BLUESKY_SEARCH_QUERIES = [
  'landed in seattle',
  'arrived in seattle',
  'arriving in seattle',
  'leaving seattle',
  'left seattle',
  'departing seattle',
  'flying to seattle',
  'flying into seattle',
  'flying out of seattle',
  'heading to seattle',
  'made it to seattle',
  'just got to seattle',
  'goodbye seattle',
  'sea-tac',
  'seatac',
  'seattle is home',
  'home in seattle',
  'back home seattle',
  'love seattle',
  'miss seattle',
  'moving to seattle',
  'moved to seattle',
  'relocating to seattle',
  'new to seattle',
  'just moved seattle',
  'moving away from seattle',
];

// Aircraft types with typical passenger capacities
const AIRCRAFT_TYPES = {
  'B737': { name: 'Boeing 737-800', capacity: 189 },
  'B738': { name: 'Boeing 737-800', capacity: 189 },
  'B739': { name: 'Boeing 737-900ER', capacity: 220 },
  'B37M': { name: 'Boeing 737 MAX 8', capacity: 178 },
  'B38M': { name: 'Boeing 737 MAX 8', capacity: 178 },
  'B39M': { name: 'Boeing 737 MAX 9', capacity: 220 },
  'B752': { name: 'Boeing 757-200', capacity: 200 },
  'B753': { name: 'Boeing 757-300', capacity: 243 },
  'B763': { name: 'Boeing 767-300ER', capacity: 269 },
  'B764': { name: 'Boeing 767-400ER', capacity: 304 },
  'B772': { name: 'Boeing 777-200', capacity: 314 },
  'B77W': { name: 'Boeing 777-300ER', capacity: 396 },
  'B788': { name: 'Boeing 787-8', capacity: 242 },
  'B789': { name: 'Boeing 787-9', capacity: 296 },
  'B78X': { name: 'Boeing 787-10', capacity: 330 },
  'A319': { name: 'Airbus A319', capacity: 156 },
  'A320': { name: 'Airbus A320', capacity: 186 },
  'A321': { name: 'Airbus A321', capacity: 236 },
  'A20N': { name: 'Airbus A321neo', capacity: 244 },
  'A21N': { name: 'Airbus A321neo', capacity: 244 },
  'A332': { name: 'Airbus A330-200', capacity: 293 },
  'A333': { name: 'Airbus A330-300', capacity: 440 },
  'A359': { name: 'Airbus A350-900', capacity: 325 },
  'E75L': { name: 'Embraer E175', capacity: 88 },
  'E75S': { name: 'Embraer E175', capacity: 76 },
  'CRJ7': { name: 'CRJ-700', capacity: 78 },
  'CRJ9': { name: 'CRJ-900', capacity: 90 },
  'DH8D': { name: 'Dash 8 Q400', capacity: 90 },
};

// Real airlines that operate at SEA
const AIRLINES = [
  { code: 'AS', name: 'Alaska Airlines', weight: 35 },
  { code: 'DL', name: 'Delta Air Lines', weight: 15 },
  { code: 'UA', name: 'United Airlines', weight: 8 },
  { code: 'AA', name: 'American Airlines', weight: 5 },
  { code: 'WN', name: 'Southwest Airlines', weight: 8 },
  { code: 'B6', name: 'JetBlue', weight: 3 },
  { code: 'NK', name: 'Spirit Airlines', weight: 3 },
  { code: 'F9', name: 'Frontier Airlines', weight: 3 },
  { code: 'HA', name: 'Hawaiian Airlines', weight: 3 },
  { code: 'SY', name: 'Sun Country', weight: 2 },
  { code: 'QX', name: 'Horizon Air', weight: 10 },
  { code: 'NH', name: 'ANA', weight: 2 },
  { code: 'KE', name: 'Korean Air', weight: 1 },
  { code: 'BR', name: 'EVA Air', weight: 1 },
  { code: 'CI', name: 'China Airlines', weight: 1 },
];

// Destinations from SEA
const DESTINATIONS = [
  'LAX', 'SFO', 'PDX', 'ANC', 'PHX', 'DEN', 'ORD', 'DFW', 'JFK', 'ATL',
  'MSP', 'DTW', 'BOS', 'IAD', 'MIA', 'LAS', 'SAN', 'OAK', 'SJC', 'SMF',
  'BOI', 'GEG', 'FAI', 'HNL', 'OGG', 'KOA', 'LIH', 'NRT', 'ICN', 'TPE',
  'PVG', 'YVR', 'YYZ', 'MEX', 'CUN', 'PVR', 'LHR', 'CDG', 'FRA',
];

// Bearing from Seattle to each destination (degrees, 0=N, 90=E, 180=S, 270=W)
const AIRPORT_BEARING = {
  // West Coast / nearby
  PDX: 170, GEG: 85, BOI: 130, SFO: 190, OAK: 190, SJC: 185, SMF: 175,
  LAX: 185, SAN: 175, LAS: 170, PHX: 155,
  // Mountain / Central
  DEN: 120, MSP: 95, DFW: 130, ORD: 100,
  // East Coast
  DTW: 90, JFK: 80, BOS: 75, IAD: 85, ATL: 110, MIA: 120,
  // Alaska / Hawaii
  ANC: 320, FAI: 335, HNL: 215, OGG: 210, KOA: 208, LIH: 218,
  // Canada
  YVR: 350, YYZ: 80,
  // Mexico
  MEX: 155, CUN: 135, PVR: 160,
  // Asia (great circle — generally NW over Pacific)
  NRT: 305, ICN: 310, TPE: 300, PVG: 305,
  // Europe (great circle — generally NE over Arctic)
  LHR: 30, CDG: 35, FRA: 35,
};

// Aircraft type distribution (weighted for SEA reality)
const FLEET_MIX = [
  { type: 'B737', weight: 15 }, { type: 'B738', weight: 15 },
  { type: 'B739', weight: 8 },  { type: 'B39M', weight: 10 },
  { type: 'B38M', weight: 5 },  { type: 'A320', weight: 8 },
  { type: 'A321', weight: 5 },  { type: 'A21N', weight: 4 },
  { type: 'E75L', weight: 12 }, { type: 'E75S', weight: 5 },
  { type: 'DH8D', weight: 5 },  { type: 'B789', weight: 3 },
  { type: 'B788', weight: 2 },  { type: 'B772', weight: 1 },
  { type: 'A359', weight: 1 },  { type: 'B763', weight: 1 },
];

function weightedRandom(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function generateFlight(type) {
  const airline = weightedRandom(AIRLINES);
  const aircraft = weightedRandom(FLEET_MIX);
  const aircraftInfo = AIRCRAFT_TYPES[aircraft.type];
  const flightNum = `${airline.code}${Math.floor(Math.random() * 9000 + 100)}`;
  const dest = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];

  const bearing = AIRPORT_BEARING[dest] || Math.random() * 360;

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    flightNumber: flightNum,
    airline: airline.name,
    airlineCode: airline.code,
    aircraftType: aircraft.type,
    aircraftName: aircraftInfo.name,
    capacity: aircraftInfo.capacity,
    type, // 'arrival' or 'departure'
    origin: type === 'arrival' ? dest : 'SEA',
    destination: type === 'departure' ? dest : 'SEA',
    bearing, // direction of the other airport from Seattle
    timestamp: Date.now(),
    gate: `${['A', 'B', 'C', 'D', 'N', 'S'][Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 20 + 1)}`,
  };
}

// Timing for flight drip-feed
const MIN_INTERVAL_MS = 8000;
const MAX_INTERVAL_MS = 25000;

function getNextInterval() {
  const hour = new Date().getHours();
  const isRush = (hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 20);
  const min = isRush ? MIN_INTERVAL_MS : MIN_INTERVAL_MS * 1.5;
  const max = isRush ? MAX_INTERVAL_MS : MAX_INTERVAL_MS * 1.5;
  return Math.floor(Math.random() * (max - min) + min);
}

function broadcastFlight(flight) {
  const message = JSON.stringify({ type: 'flight', data: flight });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ── OpenSky Network Integration ──────────────────────────────────────
const OPENSKY_CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_API_URL = 'https://opensky-network.org/api/flights';

let openskyToken = null;
let openskyTokenExpiry = 0;
const seenFlightIds = new Set(); // track icao24+lastSeen to avoid dupes
let realFlightQueue = []; // queue of real flights to drip-feed
let useRealFlights = !!OPENSKY_CLIENT_ID;
let lastOpenSkyEnd = 0; // track last query end time

// Callsign → airline mapping
const CALLSIGN_AIRLINES = {
  ASA: 'Alaska Airlines', DAL: 'Delta Air Lines', UAL: 'United Airlines',
  AAL: 'American Airlines', SWA: 'Southwest Airlines', JBU: 'JetBlue',
  NKS: 'Spirit Airlines', FFT: 'Frontier Airlines', HAL: 'Hawaiian Airlines',
  SCX: 'Sun Country', QXE: 'Horizon Air', ANA: 'ANA', KAL: 'Korean Air',
  EVA: 'EVA Air', CAL: 'China Airlines', BAW: 'British Airways',
  AFR: 'Air France', DLH: 'Lufthansa', ACA: 'Air Canada',
  SKW: 'SkyWest Airlines', RPA: 'Republic Airways', ENY: 'Envoy Air',
  PDT: 'Piedmont Airlines', CPA: 'Cathay Pacific', JAL: 'Japan Airlines',
  FDX: 'FedEx', UPS: 'UPS Airlines',
};

// ICAO type codes by common icao24 prefix ranges (fallback capacity estimation)
const DEFAULT_CAPACITY = 180;

function parseCallsign(callsign) {
  const cs = (callsign || '').trim();
  if (!cs) return { airline: 'Unknown', flightNumber: 'UNK000', airlineCode: 'UNK' };
  
  // Try 3-letter ICAO prefix
  const prefix3 = cs.substring(0, 3).toUpperCase();
  const numPart = cs.substring(3).trim();
  const airline = CALLSIGN_AIRLINES[prefix3];
  
  if (airline) {
    // Map ICAO to IATA codes
    const icaoToIata = {
      ASA: 'AS', DAL: 'DL', UAL: 'UA', AAL: 'AA', SWA: 'WN', JBU: 'B6',
      NKS: 'NK', FFT: 'F9', HAL: 'HA', SCX: 'SY', QXE: 'QX', ANA: 'NH',
      KAL: 'KE', EVA: 'BR', CAL: 'CI', BAW: 'BA', AFR: 'AF', DLH: 'LH',
      ACA: 'AC', SKW: 'OO', RPA: 'YX', ENY: 'MQ', CPA: 'CX', JAL: 'JL',
    };
    const iata = icaoToIata[prefix3] || prefix3.substring(0, 2);
    return { airline, flightNumber: `${iata}${numPart}`, airlineCode: iata };
  }
  
  return { airline: 'Unknown', flightNumber: cs, airlineCode: cs.substring(0, 2) };
}

// Estimate capacity from callsign (cargo flights get filtered, regional = smaller)
function estimateCapacity(callsign) {
  const cs = (callsign || '').trim().toUpperCase();
  const prefix = cs.substring(0, 3);
  
  // Skip cargo airlines
  if (['FDX', 'UPS', 'GTI', 'ABX', 'ATN'].includes(prefix)) return 0;
  
  // Regional carriers
  if (['SKW', 'RPA', 'ENY', 'PDT', 'QXE'].includes(prefix)) {
    return 76 + Math.floor(Math.random() * 14); // 76-90 (E175/CRJ)
  }
  
  // Widebody routes (Asia, Europe, Hawaii)
  if (['ANA', 'KAL', 'EVA', 'CAL', 'CPA', 'JAL', 'BAW', 'AFR', 'DLH'].includes(prefix)) {
    return 250 + Math.floor(Math.random() * 100); // 250-350
  }
  
  // Default narrowbody
  return 160 + Math.floor(Math.random() * 60); // 160-220
}

async function getOpenSkyToken() {
  if (openskyToken && Date.now() < openskyTokenExpiry - 60000) return openskyToken;
  
  try {
    const res = await fetch(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${OPENSKY_CLIENT_ID}&client_secret=${OPENSKY_CLIENT_SECRET}`,
    });
    const data = await res.json();
    if (data.access_token) {
      openskyToken = data.access_token;
      openskyTokenExpiry = Date.now() + (data.expires_in * 1000);
      return openskyToken;
    }
    console.error('🔑 OpenSky auth error:', data);
    return null;
  } catch (err) {
    console.error('🔑 OpenSky auth failed:', err.message);
    return null;
  }
}

async function fetchRealFlights() {
  if (!useRealFlights) return;
  
  console.log('🛩️  OpenSky: fetching token...');
  const token = await getOpenSkyToken();
  if (!token) {
    console.log('⚠️  OpenSky auth failed — check credentials');
    return;
  }
  console.log('🛩️  OpenSky: token acquired');
  
  const now = Math.floor(Date.now() / 1000);
  const headers = { 'Authorization': `Bearer ${token}` };
  
  if (!lastOpenSkyEnd) {
    // First load: fetch multiple 2h windows covering 15h-27h ago (data has ~7h delay)
    console.log('🛩️  OpenSky: loading historical flights...');
    const windowEnd = now - 54000; // 15h ago (earliest available data)
    const windowStart = windowEnd - 43200; // 12h before that (covers full busy day)
    
    // Break into 2h chunks (API max per request)
    for (let e = windowEnd; e > windowStart; e -= 7200) {
      const b = e - 7200;
      try {
        const [arrivalsRes, departuresRes] = await Promise.all([
          fetch(`${OPENSKY_API_URL}/arrival?airport=KSEA&begin=${b}&end=${e}`, { headers }),
          fetch(`${OPENSKY_API_URL}/departure?airport=KSEA&begin=${b}&end=${e}`, { headers }),
        ]);
        
        let arrivals = arrivalsRes.ok ? await arrivalsRes.json() : [];
        let departures = departuresRes.ok ? await departuresRes.json() : [];
        if (!arrivalsRes.ok) console.log(`  ⚠️ arrivals ${b}-${e}: ${arrivalsRes.status}`);
        if (!departuresRes.ok) console.log(`  ⚠️ departures ${b}-${e}: ${departuresRes.status}`);
        if (!Array.isArray(arrivals)) arrivals = [];
        if (!Array.isArray(departures)) departures = [];
        
        processFlights(arrivals, departures);
        
        // Small delay between batches to be nice to the API
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error('🛩️  OpenSky batch error:', err.message);
      }
    }
    
    lastOpenSkyEnd = windowEnd;
    realFlightQueue.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`🛩️  OpenSky: ${realFlightQueue.length} real flights loaded`);
    
  } else {
    // Subsequent polls: check if new data is available
    const begin = lastOpenSkyEnd;
    const end = begin + 7200;
    if (end > now - 54000) {
      // Can't get data fresher than ~15h ago; reload historical if queue low
      if (realFlightQueue.length < 20) {
        lastOpenSkyEnd = 0;
        return fetchRealFlights();
      }
      return;
    }
    
    try {
      const [arrivalsRes, departuresRes] = await Promise.all([
        fetch(`${OPENSKY_API_URL}/arrival?airport=KSEA&begin=${begin}&end=${end}`, { headers }),
        fetch(`${OPENSKY_API_URL}/departure?airport=KSEA&begin=${begin}&end=${end}`, { headers }),
      ]);
      
      let arrivals = arrivalsRes.ok ? await arrivalsRes.json() : [];
      let departures = departuresRes.ok ? await departuresRes.json() : [];
      if (!Array.isArray(arrivals)) arrivals = [];
      if (!Array.isArray(departures)) departures = [];
      
      const newCount = processFlights(arrivals, departures);
      lastOpenSkyEnd = end;
      realFlightQueue.sort((a, b) => a.timestamp - b.timestamp);
      if (newCount > 0) console.log(`🛩️  OpenSky: ${newCount} new flights (${realFlightQueue.length} in queue)`);
    } catch (err) {
      console.error('🛩️  OpenSky fetch error:', err.message);
    }
  }
}

function processFlights(arrivals, departures) {
  let newCount = 0;
  
  for (const f of arrivals) {
    const uid = `${f.icao24}-${f.lastSeen}`;
    if (seenFlightIds.has(uid)) continue;
    seenFlightIds.add(uid);
    
    const capacity = estimateCapacity(f.callsign);
    if (capacity === 0) continue;
    
    const parsed = parseCallsign(f.callsign);
    const origin = (f.estDepartureAirport || 'UNK').replace(/^K/, '');
    
    realFlightQueue.push({
      id: uid,
      flightNumber: parsed.flightNumber,
      airline: parsed.airline,
      airlineCode: parsed.airlineCode,
      aircraftType: 'B738',
      aircraftName: `${parsed.airline} aircraft`,
      capacity,
      type: 'arrival',
      origin,
      destination: 'SEA',
      bearing: AIRPORT_BEARING[origin] || Math.random() * 360,
      timestamp: f.lastSeen * 1000,
      gate: `${['A', 'B', 'C', 'D', 'N', 'S'][Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 20 + 1)}`,
      isReal: true,
    });
    newCount++;
  }
  
  for (const f of departures) {
    const uid = `${f.icao24}-${f.firstSeen}`;
    if (seenFlightIds.has(uid)) continue;
    seenFlightIds.add(uid);
    
    const capacity = estimateCapacity(f.callsign);
    if (capacity === 0) continue;
    
    const parsed = parseCallsign(f.callsign);
    const dest = (f.estArrivalAirport || 'UNK').replace(/^K/, '');
    
    realFlightQueue.push({
      id: uid,
      flightNumber: parsed.flightNumber,
      airline: parsed.airline,
      airlineCode: parsed.airlineCode,
      aircraftType: 'B738',
      aircraftName: `${parsed.airline} aircraft`,
      capacity,
      type: 'departure',
      origin: 'SEA',
      destination: dest,
      bearing: AIRPORT_BEARING[dest] || Math.random() * 360,
      timestamp: f.firstSeen * 1000,
      gate: `${['A', 'B', 'C', 'D', 'N', 'S'][Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 20 + 1)}`,
      isReal: true,
    });
    newCount++;
  }
  
  if (seenFlightIds.size > 5000) {
    const arr = [...seenFlightIds];
    arr.splice(0, 2000);
    seenFlightIds.clear();
    arr.forEach(id => seenFlightIds.add(id));
  }
  
  return newCount;
}

// Drip-feed real flights only — no simulation
function scheduleNextFlight() {
  const interval = getNextInterval();
  setTimeout(() => {
    if (realFlightQueue.length > 0) {
      const flight = realFlightQueue.shift();
      flight.timestamp = Date.now();
      const icon = flight.type === 'arrival' ? '🛬' : '🛫';
      console.log(`✈️  ${icon} ${flight.flightNumber} | ${flight.airline} (${flight.capacity} pax) | ${flight.origin} → ${flight.destination} [REAL]`);
      broadcastFlight(flight);
    } else {
      console.log('⏳ Waiting for more real flight data...');
    }
    scheduleNextFlight();
  }, interval);
}

// Poll OpenSky every 5 minutes for new flight data
if (useRealFlights) {
  console.log('🛩️  OpenSky: LIVE mode (polling real flights)');
  // Wait for initial fetch to complete before starting the drip-feed
  fetchRealFlights().then(() => {
    console.log('🛩️  Starting flight feed...');
    scheduleNextFlight();
  });
  setInterval(fetchRealFlights, 5 * 60 * 1000);
} else {
  console.log('🛩️  OpenSky: no credentials — no flights will be shown');
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  ws.send(JSON.stringify({
    type: 'welcome',
    data: { message: 'Connected to SEA Flight Tracker', airport: 'KSEA' }
  }));

  // Send cached posts with staggered timing so they appear naturally
  recentPosts.forEach((post, i) => {
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'post', data: post }));
      }
    }, 500 + i * 400);
  });

  ws.on('close', () => console.log('👤 Client disconnected'));
});

// ── Bluesky Polling ──────────────────────────────────────────────────

// Track seen post URIs, content hashes, and seen authors (one post per user per 10 min)
const seenPosts = new Set();
const seenContent = new Set(); // normalized text hashes to prevent cross-platform dupes
const seenAuthors = new Map(); // did -> timestamp
let currentQueryIndex = 0;
const AUTHOR_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

function contentKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 80);
}

// Keywords that indicate someone is personally coming to or leaving Seattle
const ARRIVAL_KEYWORDS = ['landed in seattle', 'arrived in seattle', 'arriving in seattle',
  'flying to seattle', 'flying into seattle', 'heading to seattle',
  'made it to seattle', 'just got to seattle', 'touched down',
  'at seatac', 'at sea-tac', 'pulling into seattle',
  'back in seattle', 'back home in seattle', 'home in seattle',
  'seattle is home', 'returned to seattle', 'welcome to seattle'];
const DEPARTURE_KEYWORDS = ['left seattle', 'leaving seattle', 'departing seattle',
  'flying out of seattle', 'goodbye seattle', 'bye seattle',
  'heading out of seattle', 'taking off from sea',
  'moving from seattle', 'moved from seattle', 'miss seattle'];

const HOME_KEYWORDS = ['seattle is home', 'home in seattle', 'back home seattle',
  'love seattle', 'i love seattle', 'my city seattle',
  'moving to seattle', 'moved to seattle', 'relocating to seattle',
  'new to seattle', 'just moved seattle'];

const MOVE_AWAY_KEYWORDS = ['moving away from seattle', 'moved from seattle',
  'moving from seattle', 'leaving seattle for'];

function isAboutComingOrLeaving(text) {
  const lower = text.toLowerCase();
  for (const kw of ARRIVAL_KEYWORDS) if (lower.includes(kw)) return true;
  for (const kw of DEPARTURE_KEYWORDS) if (lower.includes(kw)) return true;
  for (const kw of HOME_KEYWORDS) if (lower.includes(kw)) return true;
  for (const kw of MOVE_AWAY_KEYWORDS) if (lower.includes(kw)) return true;
  return false;
}

function classifyPost(text) {
  const lower = text.toLowerCase();
  for (const w of DEPARTURE_KEYWORDS) if (lower.includes(w)) return 'departure';
  for (const w of MOVE_AWAY_KEYWORDS) if (lower.includes(w)) return 'departure';
  for (const w of HOME_KEYWORDS) if (lower.includes(w)) return 'arrival';
  for (const w of ARRIVAL_KEYWORDS) if (lower.includes(w)) return 'arrival';
  return 'arrival';
}

async function pollBluesky() {
  // Rotate through queries to spread coverage and avoid rate issues
  const query = BLUESKY_SEARCH_QUERIES[currentQueryIndex % BLUESKY_SEARCH_QUERIES.length];
  currentQueryIndex++;

  try {
    const url = `${BLUESKY_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=5&sort=latest`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`🦋 Bluesky API error: ${res.status} ${res.statusText}`);
      return;
    }

    const data = await res.json();
    const posts = data.posts || [];

    for (const post of posts) {
      const uri = post.uri;
      if (seenPosts.has(uri)) continue;
      seenPosts.add(uri);

      const author = post.author || {};
      const authorDid = author.did || uri;
      const record = post.record || {};
      const text = record.text || '';

      // Skip short posts
      if (text.length < 15) continue;

      // Only include posts about personally coming to or leaving Seattle
      if (!isAboutComingOrLeaving(text)) continue;

      // Cross-platform content dedup
      const ck = contentKey(text);
      if (seenContent.has(ck)) continue;
      seenContent.add(ck);

      // One post per user per 10 minutes
      const lastSeen = seenAuthors.get(authorDid);
      if (lastSeen && (Date.now() - lastSeen) < AUTHOR_COOLDOWN_MS) continue;
      seenAuthors.set(authorDid, Date.now());

      // Keep sets manageable
      if (seenPosts.size > 2000) {
        const iter = seenPosts.values();
        for (let i = 0; i < 500; i++) seenPosts.delete(iter.next().value);
      }

      const postData = {
        id: uri,
        text,
        author: author.displayName || author.handle || 'someone',
        handle: `@${author.handle || 'unknown'}`,
        avatar: '🦋',
        sentiment: classifyPost(text),
        timestamp: new Date(record.createdAt || post.indexedAt).getTime(),
        isSimulated: false,
        likes: post.likeCount || 0,
        reposts: post.repostCount || 0,
        platform: 'bluesky',
      };

      console.log(`🦋 ${postData.handle}: "${text.substring(0, 60)}..."`);
      broadcastPost(postData);
    }
  } catch (err) {
    console.error('🦋 Bluesky fetch error:', err.message);
  }
}

// Cache recent posts to send immediately to new clients
const recentPosts = [];
const MAX_RECENT_POSTS = 10;

function broadcastPost(post) {
  recentPosts.push(post);
  if (recentPosts.length > MAX_RECENT_POSTS) recentPosts.shift();
  const message = JSON.stringify({ type: 'post', data: post });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ── Reddit polling ───────────────────────────────────────────────────
async function pollReddit() {
  const query = REDDIT_SEARCH_QUERIES[redditQueryIndex % REDDIT_SEARCH_QUERIES.length];
  redditQueryIndex++;

  try {
    // Reddit blocks node-fetch but allows curl, so we shell out
    const { execSync } = require('child_process');
    const url = `${REDDIT_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=new&limit=5&t=week`;
    const result = execSync(`curl -s -H "User-Agent: ${REDDIT_USER_AGENT}" "${url}"`, { timeout: 10000 });
    const data = JSON.parse(result.toString());
    const posts = (data.data && data.data.children) || [];

    for (const item of posts) {
      const post = item.data;
      if (!post) continue;

      const uri = `reddit:${post.id}`;
      if (seenPosts.has(uri)) continue;
      seenPosts.add(uri);

      const author = post.author || 'someone';
      const authorId = `reddit:${author}`;

      // Combine title and selftext for matching — but title must mention Seattle
      const title = (post.title || '').trim();
      const fullText = `${title} ${post.selftext || ''}`.trim();
      if (fullText.length < 15) continue;

      // Must mention Seattle/SeaTac somewhere in the title
      const titleLower = title.toLowerCase();
      if (!titleLower.includes('seattle') && !titleLower.includes('seatac') && !titleLower.includes('sea-tac')) continue;

      if (!isAboutComingOrLeaving(fullText)) continue;

      // Cross-platform content dedup
      const ck = contentKey(fullText);
      if (seenContent.has(ck)) continue;
      seenContent.add(ck);

      // One post per user per 10 minutes
      const lastSeen = seenAuthors.get(authorId);
      if (lastSeen && (Date.now() - lastSeen) < AUTHOR_COOLDOWN_MS) continue;
      seenAuthors.set(authorId, Date.now());

      // Use title as display text (usually more concise)
      const displayText = post.title || fullText.substring(0, 200);

      const postData = {
        id: uri,
        text: displayText,
        author: `u/${author}`,
        handle: `u/${author}`,
        avatar: '🟠',
        sentiment: classifyPost(fullText),
        timestamp: (post.created_utc || Date.now() / 1000) * 1000,
        isSimulated: false,
        likes: post.ups || 0,
        reposts: 0,
        platform: 'reddit',
      };

      console.log(`🟠 u/${author}: "${displayText.substring(0, 60)}..."`);
      broadcastPost(postData);
    }
  } catch (err) {
    console.error('🟠 Reddit fetch error:', err.message);
  }
}

// Poll Bluesky every 15 seconds, Reddit every 20 seconds (staggered)
setInterval(pollBluesky, 15000);
setInterval(pollReddit, 20000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🛫 SEA Flight Tracker running at http://localhost:${PORT}`);
  console.log('   Tracking real flights at Seattle-Tacoma International Airport');
  console.log('   🦋 Bluesky: LIVE (no API key needed)');
  console.log('   🟠 Reddit: LIVE (no API key needed)\n');
  // Initial polls — stagger first few queries
  pollBluesky();
  setTimeout(pollBluesky, 3000);
  setTimeout(pollBluesky, 6000);
  setTimeout(pollReddit, 2000);
  setTimeout(pollReddit, 5000);
});
