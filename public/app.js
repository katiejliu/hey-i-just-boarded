(function () {
  'use strict';

  // About toggle for mobile
  const aboutToggle = document.getElementById('aboutToggle');
  const aboutContent = document.getElementById('aboutContent');
  if (aboutToggle && aboutContent) {
    aboutToggle.addEventListener('click', () => {
      aboutContent.classList.toggle('open');
      aboutToggle.textContent = aboutContent.classList.contains('open') ? 'close' : 'about';
    });
  }

  let netPax = 0, arrivalCount = 0, departureCount = 0, arrivedPax = 0, departedPax = 0;
  let currentFilter = 'all';
  let flights = [], tweets = [], tweetCount = 0;
  const sessionStart = Date.now();
  const TWEET_DELAY_START = 3000; // wait 3s before showing any tweets
  const isMobile = window.innerWidth <= 768;
  const TWEET_THROTTLE_PERIOD = 15000;
  const TWEET_DELAY_SLOW = isMobile ? 10000 : 3000;
  const TWEET_DELAY_FAST = isMobile ? 10000 : 800;
  const tweetQueue = [];
  const seenTweetIds = new Set();
  let tweetProcessing = false;

  function queueTweet(data) {
    // Deduplicate by URI or by normalized text content
    const id = data.uri || data.url || '';
    const textKey = (data.text || '').toLowerCase().trim().slice(0, 100);
    if (id && seenTweetIds.has(id)) return;
    if (textKey && seenTweetIds.has(textKey)) return;
    if (id) seenTweetIds.add(id);
    if (textKey) seenTweetIds.add(textKey);
    tweetQueue.push(data);
    processTweetQueue();
  }

  function processTweetQueue() {
    if (tweetProcessing || tweetQueue.length === 0) return;
    const elapsed = Date.now() - sessionStart;
    if (elapsed < TWEET_DELAY_START) {
      setTimeout(processTweetQueue, TWEET_DELAY_START - elapsed + 100);
      return;
    }
    tweetProcessing = true;
    const data = tweetQueue.shift();
    showTweetBubble(data);
    addTweetToLog(data);
    const delay = elapsed < TWEET_THROTTLE_PERIOD ? TWEET_DELAY_SLOW : TWEET_DELAY_FAST;
    setTimeout(() => {
      tweetProcessing = false;
      processTweetQueue();
    }, delay);
  }

  const els = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    sessionTime: document.getElementById('sessionTime'),
    netPaxCount: document.getElementById('netPaxCount'),
    arrivalCount: document.getElementById('arrivalCount'),
    departureCount: document.getElementById('departureCount'),
    arrivedPax: document.getElementById('arrivedPax'),
    departedPax: document.getElementById('departedPax'),
    counterTrend: document.getElementById('counterTrend'),
    centralCounter: document.getElementById('centralCounter'),
    flightFeed: document.getElementById('flightFeed'),
    planesLayer: document.getElementById('planesLayer'),
    tweetOverlay: document.getElementById('tweetOverlay'),
    lightTrails: document.getElementById('lightTrails'),
    tweetLog: document.getElementById('tweetLog'),
    tweetCountDisplay: document.getElementById('tweetCountDisplay'),
  };

  // Session timer
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    els.sessionTime.textContent = `${m}:${s}`;
  }, 1000);

  function animateNumber(el, target) {
    const current = parseInt(el.textContent.replace(/,/g, '')) || 0;
    if (current === target) return;
    const diff = target - current;
    const steps = 20;
    const stepSize = diff / steps;
    let step = 0;
    function tick() {
      step++;
      el.textContent = (step === steps ? target : Math.round(current + stepSize * step)).toLocaleString();
      if (step < steps) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Counter ─────────────────────────────────────────────────────────
  function updateCounter(flight) {
    const delta = flight.type === 'arrival' ? flight.capacity : -flight.capacity;
    netPax += delta;
    if (flight.type === 'arrival') { arrivalCount++; arrivedPax += flight.capacity; }
    else { departureCount++; departedPax += flight.capacity; }

    animateNumber(els.netPaxCount, netPax);
    animateNumber(els.arrivalCount, arrivalCount);
    animateNumber(els.departureCount, departureCount);
    animateNumber(els.arrivedPax, arrivedPax);
    animateNumber(els.departedPax, departedPax);

    const cv = els.netPaxCount;
    cv.classList.remove('positive', 'negative');
    if (netPax > 0) cv.classList.add('positive');
    else if (netPax < 0) cv.classList.add('negative');

    const sign = delta > 0 ? '+' : '';
    els.counterTrend.textContent = `${sign}${delta.toLocaleString()} · ${flight.flightNumber}`;
    els.counterTrend.className = 'counter-delta ' + (delta > 0 ? 'up' : 'down');

    els.centralCounter.classList.remove('counter-flash');
    void els.centralCounter.offsetWidth;
    els.centralCounter.classList.add('counter-flash');
  }

  // ── Firefly + light trail ───────────────────────────────────────────
  // World map projection: Mercator-like, centered so Seattle is in the middle
  // Canvas: 4000x2000, Seattle at center (2000, 800)
  const SEA_LAT = 47.45, SEA_LON = -122.31;

  // Airport coordinates (lat, lon)
  const AIRPORT_COORDS = {
    SEA: [47.45, -122.31],
    LAX: [33.94, -118.41], SFO: [37.62, -122.38], PDX: [45.59, -122.60],
    ANC: [61.17, -149.99], PHX: [33.43, -112.01], DEN: [39.86, -104.67],
    ORD: [41.98, -87.90], DFW: [32.90, -97.04], JFK: [40.64, -73.78],
    ATL: [33.64, -84.43], MSP: [44.88, -93.22], DTW: [42.21, -83.35],
    BOS: [42.36, -71.01], IAD: [38.95, -77.46], MIA: [25.80, -80.29],
    LAS: [36.08, -115.15], SAN: [32.73, -117.19], OAK: [37.72, -122.22],
    SJC: [37.36, -121.93], SMF: [38.70, -121.59], BOI: [43.56, -116.22],
    GEG: [47.62, -117.53], FAI: [64.82, -147.86],
    HNL: [21.32, -157.92], OGG: [20.90, -156.43], KOA: [19.74, -156.05], LIH: [21.98, -159.34],
    YVR: [49.19, -123.18], YYZ: [43.68, -79.63],
    MEX: [19.44, -99.07], CUN: [21.04, -86.87], PVR: [20.68, -105.25],
    NRT: [35.76, 140.39], ICN: [37.46, 126.44], TPE: [25.08, 121.23], PVG: [31.14, 121.81],
    LHR: [51.47, -0.46], CDG: [49.01, 2.55], FRA: [50.03, 8.57],
  };

  // Mercator projection: lon/lat → canvas x/y
  function geoToCanvas(lat, lon) {
    // Center on Seattle, scale so world fits in 4000x2000
    const scale = 11; // pixels per degree
    let dLon = lon - SEA_LON;
    // Handle date line wrapping for Asian airports
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const x = 2000 + dLon * scale;
    const y = 800 - (lat - SEA_LAT) * scale;
    return { x, y };
  }

  // Place airport markers on the SVG
  const markersGroup = document.getElementById('airportMarkers');
  const placedAirports = new Set();

  function ensureAirportMarker(code) {
    if (placedAirports.has(code)) return;
    const coords = AIRPORT_COORDS[code];
    if (!coords) return;
    placedAirports.add(code);

    const pos = geoToCanvas(coords[0], coords[1]);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('opacity', code === 'SEA' ? '0.9' : '0.7');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', code === 'SEA' ? '8' : '4');
    circle.setAttribute('fill', '#8ab4f8');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pos.x);
    label.setAttribute('y', pos.y + 25);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-family', 'Gaegu');
    label.setAttribute('font-size', code === 'SEA' ? '18' : '14');
    label.setAttribute('fill', '#8ab4f8');
    label.textContent = code;

    g.appendChild(circle);
    g.appendChild(label);
    markersGroup.appendChild(g);
  }

  // Place Seattle immediately
  ensureAirportMarker('SEA');

  // Scroll to center Seattle on load
  const canvasWrap = document.getElementById('canvasWrap');
  requestAnimationFrame(() => {
    const seaPos = geoToCanvas(SEA_LAT, SEA_LON);
    canvasWrap.scrollLeft = seaPos.x - canvasWrap.clientWidth / 2;
    canvasWrap.scrollTop = seaPos.y - canvasWrap.clientHeight / 2;
  });

  const CENTER_X = 2000;
  const CENTER_Y = 800;

  function createFireflyTrail(flight) {
    const svg = els.lightTrails;
    const isArrival = flight.type === 'arrival';

    // Get the remote airport code
    const remoteCode = isArrival ? flight.origin : flight.destination;
    const remoteCoords = AIRPORT_COORDS[remoteCode];

    let edgeX, edgeY;
    if (remoteCoords) {
      // Place marker for this airport
      ensureAirportMarker(remoteCode);
      const pos = geoToCanvas(remoteCoords[0], remoteCoords[1]);
      edgeX = pos.x;
      edgeY = pos.y;
    } else {
      // Fallback: use bearing
      const bearing = (flight.bearing || Math.random() * 360) * (Math.PI / 180);
      const dist = 600 + Math.random() * 400;
      edgeX = CENTER_X + Math.sin(bearing) * dist;
      edgeY = CENTER_Y - Math.cos(bearing) * dist;
    }

    // Scale wobble based on path distance
    const dist = Math.hypot(CENTER_X - edgeX, CENTER_Y - edgeY);
    const wobble = Math.min(dist * 0.15, 200);
    const cp1x = edgeX + (CENTER_X - edgeX) * 0.3 + (Math.random() - 0.5) * wobble;
    const cp1y = edgeY + (CENTER_Y - edgeY) * 0.3 + (Math.random() - 0.5) * wobble * 0.7;
    const cp2x = edgeX + (CENTER_X - edgeX) * 0.7 + (Math.random() - 0.5) * wobble;
    const cp2y = edgeY + (CENTER_Y - edgeY) * 0.7 + (Math.random() - 0.5) * wobble * 0.7;

    const startX = isArrival ? edgeX : CENTER_X;
    const startY = isArrival ? edgeY : CENTER_Y;
    const endX = isArrival ? CENTER_X : edgeX;
    const endY = isArrival ? CENTER_Y : edgeY;

    const sCp1x = isArrival ? cp1x : cp2x;
    const sCp1y = isArrival ? cp1y : cp2y;
    const sCp2x = isArrival ? cp2x : cp1x;
    const sCp2y = isArrival ? cp2y : cp1y;

    const pathD = `M ${startX},${startY} C ${sCp1x},${sCp1y} ${sCp2x},${sCp2y} ${endX},${endY}`;

    // Draw the persistent trail
    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trail.setAttribute('d', pathD);
    trail.setAttribute('class', `light-trail ${isArrival ? 'arrival-trail' : 'departure-trail'}`);
    svg.appendChild(trail);

    // Animate the trail being drawn
    const trailLength = trail.getTotalLength();
    trail.style.strokeDasharray = trailLength;
    trail.style.strokeDashoffset = trailLength;
    trail.style.opacity = '0';

    // Firefly dot (HTML element for richer glow)
    const firefly = document.createElement('div');
    firefly.className = `firefly ${isArrival ? 'arriving' : 'departing'}`;
    els.planesLayer.appendChild(firefly);

    const duration = 4000 + Math.random() * 2000; // longer for bigger distances
    const startTime = performance.now();

    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease: slow start, smooth middle, slow end (like a firefly drifting)
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      try {
        // Draw trail progressively
        trail.style.strokeDashoffset = trailLength * (1 - eased);
        trail.style.opacity = 0.45;
        // Move firefly — position relative to the inner canvas
        const point = trail.getPointAtLength(eased * trailLength);
        // SVG viewBox is 4000x2000, canvas-inner is 4000x2000, so 1:1
        firefly.style.left = (point.x - 3) + 'px';
        firefly.style.top = (point.y - 3) + 'px';

        // Firefly flicker
        const flicker = 0.6 + Math.sin(elapsed * 0.008) * 0.3 + Math.sin(elapsed * 0.013) * 0.1;
        firefly.style.opacity = progress < 0.05 ? progress / 0.05 * flicker
          : progress > 0.9 ? (1 - progress) / 0.1 * flicker
          : flicker;

      } catch (e) { /* element removed */ }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        firefly.style.opacity = '0';
        setTimeout(() => firefly.remove(), 300);
        // Trail stays — slowly fade to very dim
        trail.style.opacity = '0.45';
        trail.style.strokeDashoffset = '0';
      }
    }
    requestAnimationFrame(animate);
  }

  // ── Tweet bubbles (persistent, max 6) ──────────────────────────────
  let activeBubbles = [];
  const MAX_BUBBLES = 6;

  // Keep tweet overlay aligned to the map area
  function alignTweetOverlay() {
    const wrap = document.getElementById('canvasWrap');
    const rect = wrap.getBoundingClientRect();
    els.tweetOverlay.style.top = rect.top + 'px';
    els.tweetOverlay.style.left = rect.left + 'px';
    els.tweetOverlay.style.width = rect.width + 'px';
    els.tweetOverlay.style.height = rect.height + 'px';
  }
  window.addEventListener('resize', alignTweetOverlay);
  window.addEventListener('scroll', alignTweetOverlay);
  setInterval(alignTweetOverlay, 500);
  alignTweetOverlay();

  function showTweetBubble(tweet) {
    if (activeBubbles.length >= MAX_BUBBLES) {
      const oldest = activeBubbles.shift();
      if (oldest && oldest.parentNode) {
        oldest.style.animation = 'bubbleFadeOut 0.8s ease-in forwards';
        setTimeout(() => oldest.remove(), 800);
      }
    }

    const bubble = document.createElement('div');
    const sc = tweet.sentiment === 'arrival' ? 'arrival-tweet' : 'departure-tweet';
    bubble.className = `tweet-bubble ${sc}`;

    // Place bubbles in edge zones — avoid center where counter is
    const zones = [
      () => ({ x: 2 + Math.random() * 20, y: 5 + Math.random() * 85 }),   // left strip
      () => ({ x: 75 + Math.random() * 20, y: 5 + Math.random() * 85 }),  // right strip
      () => ({ x: 2 + Math.random() * 40, y: 65 + Math.random() * 25 }), // bottom-left
      () => ({ x: 55 + Math.random() * 40, y: 65 + Math.random() * 25 }), // bottom-right
    ];
    const zone = zones[Math.floor(Math.random() * zones.length)]();
    const x = zone.x;
    const y = zone.y;

    bubble.style.left = x + '%';
    bubble.style.top = y + '%';

    bubble.innerHTML = `
      <button class="tweet-bubble-close" aria-label="Dismiss">&times;</button>
      <div class="tweet-bubble-header">
        <span class="tweet-bubble-avatar">${escapeHtml(tweet.avatar)}</span>
        <span class="tweet-bubble-handle">${escapeHtml(tweet.handle)}</span>
      </div>
      <div class="tweet-bubble-text">${escapeHtml(tweet.text)}</div>
      <div class="tweet-bubble-meta">
        <span>❤️ ${tweet.likes}</span>
        <span>🔁 ${tweet.reposts || 0}</span>
      </div>
    `;

    function dismissBubble(b) {
      b.style.animation = 'bubbleFadeOut 0.5s ease-in forwards';
      setTimeout(() => {
        b.remove();
        const idx = activeBubbles.indexOf(b);
        if (idx > -1) activeBubbles.splice(idx, 1);
      }, 500);
    }

    bubble.querySelector('.tweet-bubble-close').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissBubble(bubble);
    });

    // Double-tap to dismiss on mobile
    let lastTap = 0;
    bubble.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        e.preventDefault();
        dismissBubble(bubble);
      }
      lastTap = now;
    });

    // Make draggable
    makeDraggable(bubble);

    els.tweetOverlay.appendChild(bubble);
    activeBubbles.push(bubble);

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (bubble.parentNode) {
        bubble.style.animation = 'bubbleFadeOut 0.8s ease-in forwards';
        setTimeout(() => {
          bubble.remove();
          const idx = activeBubbles.indexOf(bubble);
          if (idx > -1) activeBubbles.splice(idx, 1);
        }, 800);
      }
    }, 30000);
  }

  // ── Drag support ───────────────────────────────────────────────────
  function makeDraggable(el) {
    let isDragging = false, startX, startY, origLeft, origTop;

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });

    function onDown(e) {
      isDragging = true;
      const pos = e.touches ? e.touches[0] : e;
      startX = pos.clientX;
      startY = pos.clientY;
      origLeft = el.offsetLeft;
      origTop = el.offsetTop;
      el.style.left = origLeft + 'px';
      el.style.top = origTop + 'px';
      el.style.cursor = 'grabbing';
      el.style.zIndex = '30';
      e.preventDefault();

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
      if (!isDragging) return;
      const pos = e.touches ? e.touches[0] : e;
      el.style.left = (origLeft + pos.clientX - startX) + 'px';
      el.style.top = (origTop + pos.clientY - startY) + 'px';
      e.preventDefault();
    }

    function onUp() {
      isDragging = false;
      el.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
  }

  // ── Tweet log ──────────────────────────────────────────────────────
  function addTweetToLog(tweet) {
    tweets.unshift(tweet);
    if (tweets.length > 50) tweets.pop();
    tweetCount++;
    els.tweetCountDisplay.textContent = tweetCount;
    renderTweetLog();
  }

  function renderTweetLog() {
    if (!tweets.length) {
      els.tweetLog.innerHTML = '<div class="log-empty">listening for posts about seattle...</div>';
      return;
    }
    els.tweetLog.innerHTML = tweets.map(t => {
      const time = new Date(t.timestamp);
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const sc = t.sentiment === 'arrival' ? 'arrival-tweet' : 'departure-tweet';
      const label = t.sentiment === 'arrival' ? 'arriving' : 'leaving';
      const badge = t.platform === 'bluesky' ? '<span class="tweet-log-sim">🦋</span>'
        : t.platform === 'reddit' ? '<span class="tweet-log-sim">🟠</span>' : '';
      return `
        <div class="tweet-log-entry ${sc}">
          <div class="tweet-log-avatar">${escapeHtml(t.avatar)}</div>
          <div class="tweet-log-body">
            <div class="tweet-log-header">
              <span class="tweet-log-author">${escapeHtml(t.author)}</span>
              <span class="tweet-log-handle">${escapeHtml(t.handle)}</span>
              <span class="tweet-log-tag">${label}</span>
            </div>
            <div class="tweet-log-text">${escapeHtml(t.text)}</div>
            <div class="tweet-log-footer">
              <span>❤️ ${t.likes}</span>
              <span>🔁 ${t.reposts || 0}</span>
              <span class="tweet-log-time">${timeStr}${badge}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Flight feed ────────────────────────────────────────────────────
  function addFlightToFeed(flight) {
    flights.unshift(flight);
    if (flights.length > 100) flights.pop();
    renderFeed();
  }

  function renderFeed() {
    const filtered = currentFilter === 'all' ? flights : flights.filter(f => f.type === currentFilter);
    if (!filtered.length) {
      els.flightFeed.innerHTML = '<div class="log-empty">waiting for planes...</div>';
      return;
    }
    els.flightFeed.innerHTML = filtered.map(f => {
      const time = new Date(f.timestamp);
      const ts = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const sign = f.type === 'arrival' ? '+' : '-';
      return `
        <div class="flight-entry ${f.type}">
          <div class="entry-type">${f.type === 'arrival' ? 'arr' : 'dep'}</div>
          <div class="entry-flight">${f.flightNumber}</div>
          <div class="entry-airline">${f.airline}</div>
          <div class="entry-route"><span>${f.origin}</span><span class="arrow">→</span><span>${f.destination}</span></div>
          <div class="entry-aircraft">${f.aircraftName}</div>
          <div class="entry-pax">${sign}${f.capacity}</div>
          <div class="entry-time">${ts}</div>
        </div>`;
    }).join('');
  }

  document.querySelectorAll('.log-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderFeed();
    });
  });

  // ── WebSocket ──────────────────────────────────────────────────────
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => {
      els.statusDot.classList.add('connected');
      els.statusText.textContent = 'live';
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'flight') {
        updateCounter(msg.data);
        createFireflyTrail(msg.data);
        addFlightToFeed(msg.data);
      } else if (msg.type === 'post') {
        queueTweet(msg.data);
      }
    };

    ws.onclose = () => {
      els.statusDot.classList.remove('connected');
      els.statusText.textContent = 'reconnecting...';
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }

  connect();
})();
