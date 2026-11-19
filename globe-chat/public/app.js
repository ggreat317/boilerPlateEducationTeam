// =====================================================
//  State
// =====================================================
let selected = null;   // GeoJSON feature of the selected country, or null
let hovered = null;    // feature under the mouse
let myName = '';
let collapsed = false; // is the chat panel hidden?
let unread = 0;        // new messages that arrived while it was hidden

const socket = io();   // connects to the same server that served this page

// =====================================================
//  DOM references
// =====================================================
const els = {
  layout:   document.getElementById('layout'),
  globe:    document.getElementById('globe'),
  stars:    document.getElementById('stars'),
  warp:     document.getElementById('warp'),
  link:     document.getElementById('link'),
  linkText: document.getElementById('link-text'),
  readout:  document.getElementById('readout'),
  readoutName:   document.getElementById('readout-name'),
  readoutCoords: document.getElementById('readout-coords'),
  expand:   document.getElementById('chat-expand'),
  expandLabel: document.getElementById('chat-expand-label'),
  unread:   document.getElementById('chat-unread'),
  collapse: document.getElementById('chat-collapse'),
  me:       document.getElementById('me'),
  title:    document.getElementById('chat-title'),
  online:   document.getElementById('chat-online'),
  close:    document.getElementById('chat-close'),
  messages: document.getElementById('chat-messages'),
  empty:    document.getElementById('chat-empty'),
  status:   document.getElementById('chat-status'),
  form:     document.getElementById('chat-form'),
  input:    document.getElementById('chat-input'),
  send:     document.getElementById('chat-send'),
};

const codeOf = (f) => f.properties.ADM0_A3;   // 3 letter code, e.g. "FRA"
const nameOf = (f) => f.properties.ADMIN;     // display name, e.g. "France"

// =====================================================
//  Globe
// =====================================================
const globe = new Globe(els.globe)
  .backgroundColor('rgba(0,0,0,0)')                 // see-through, so the stars show behind
  .globeImageUrl('/textures/earth-night.jpg')        // Earth at night with city lights
  .atmosphereColor('#7fb2ff')
  .atmosphereAltitude(0.18)
  .polygonSideColor(() => 'rgba(242,181,68,0.12)')
  .polygonStrokeColor(() => 'rgba(242,181,68,0.3)')  // thin gold borders
  .polygonLabel((f) => nameOf(f))
  .polygonsTransitionDuration(200)
  .onPolygonHover((f) => {
    hovered = f;
    els.globe.style.cursor = f ? 'pointer' : 'grab';
    refreshGlobe();
  })
  .onPolygonClick((f, _event, coords) => selectCountry(f, coords))
  .onGlobeClick(() => selectCountry(null));   // clicking the ocean deselects

globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.35;

// Softer, more even lighting so the night side and its city lights stay visible
const [ambientLight, sunLight] = globe.lights();
ambientLight.intensity *= 1.5;
sunLight.intensity *= 0.35;

// Passing new accessor functions tells globe.gl to recolor the countries.
// Countries are mostly see-through so the city lights underneath stay visible.
function refreshGlobe() {
  globe
    .polygonAltitude((f) => (f === selected ? 0.04 : f === hovered ? 0.015 : 0.006))
    .polygonCapColor((f) =>
      f === selected ? 'rgba(242,181,68,0.45)' : f === hovered ? 'rgba(242,181,68,0.2)' : 'rgba(0,0,0,0)'
    );
}

function resizeGlobe() {
  globe.width(els.globe.clientWidth).height(els.globe.clientHeight);
}
// Resize the globe whenever its box changes size: window resizes AND the chat opening/closing
new ResizeObserver(resizeGlobe).observe(els.globe);
resizeGlobe();
refreshGlobe();

fetch('countries.geojson')
  .then((res) => res.json())
  .then((geo) => globe.polygonsData(geo.features.filter((f) => codeOf(f) !== 'ATA'))); // skip Antarctica

// =====================================================
//  Selecting a country
// =====================================================
function selectCountry(feature, coords) {
  if (feature === selected) return;
  selected = feature;
  refreshGlobe();

  if (!feature) {
    socket.emit('leave');
    setChatEnabled(false);
    setReadout(null);
    globe.controls().autoRotate = true;
    return;
  }

  globe.controls().autoRotate = false;
  if (coords) globe.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.8 }, 900);
  starfield.jump();   // stars streak past while the globe flies to the country

  setChatEnabled(true);
  setReadout(feature, coords);
  joinRoom();
}

// Country name and coordinates in the bottom left of the view
function setReadout(feature, coords) {
  els.readout.classList.toggle('active', !!feature);
  els.readoutName.textContent = feature ? nameOf(feature) : 'Pick a country to open its channel';
  els.readoutCoords.textContent = feature && coords ? formatCoords(coords) : '';
}

function formatCoords({ lat, lng }) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`;
}

// =====================================================
//  Starfield
//  Stars drift slowly behind the globe. When you pick a country they streak
//  into hyperspace on a second layer in front of the globe, then settle again.
// =====================================================
const starfield = (() => {
  const back = els.stars.getContext('2d');   // calm stars, behind the globe
  const front = els.warp.getContext('2d');   // streaks, in front of the globe
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;  // respect the OS setting
  const COUNT = 650;
  const JUMP_MS = 1100;
  const STAR_COLOR = '#e6eeff';
  const stars = [];
  let width = 0, height = 0;
  let jumpStart = -Infinity;
  let frontDirty = false;

  // Each star has an x/y spread around the center and a depth z (1 = far away, near 0 = right in front of you)
  function placeStar(star, far) {
    star.x = Math.random() * 2 - 1;
    star.y = Math.random() * 2 - 1;
    star.z = far ? 0.7 + Math.random() * 0.3 : 0.15 + Math.random() * 0.85;
    star.brightness = 0.45 + Math.random() * 0.55;
  }
  for (let i = 0; i < COUNT; i++) { const s = {}; placeStar(s, false); stars.push(s); }

  // Turn a star's 3D position into a point on screen (closer stars sit further from the center)
  function toScreen(star, z) {
    const spread = Math.max(width, height) * 0.25;
    return [width / 2 + (star.x / z) * spread, height / 2 + (star.y / z) * spread];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = els.stars.clientWidth;
    height = els.stars.clientHeight;
    for (const canvas of [els.stars, els.warp]) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (still) draw(0);
  }

  function draw(warp) {
    const jumping = warp > 0.02;
    back.clearRect(0, 0, width, height);
    if (jumping || frontDirty) front.clearRect(0, 0, width, height);
    frontDirty = jumping;

    const speed = 0.0004 + warp * 0.022;   // tiny drift normally, very fast during a jump

    for (const star of stars) {
      if (!still) star.z -= speed;
      if (star.z <= 0.03) { placeStar(star, true); continue; }

      const [x, y] = toScreen(star, star.z);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) { placeStar(star, true); continue; }

      const closeness = 1 - star.z;   // 0 far .. 1 close

      if (jumping) {
        // A line from a little further back to where the star is now: a streak
        const [tx, ty] = toScreen(star, Math.min(star.z + 0.04 + warp * 0.3, 1.3));
        front.globalAlpha = star.brightness * (0.2 + closeness * 0.6) * Math.min(1, warp * 1.4);
        front.strokeStyle = STAR_COLOR;
        front.lineWidth = 0.5 + closeness * 1.5;
        front.beginPath();
        front.moveTo(tx, ty);
        front.lineTo(x, y);
        front.stroke();
      } else {
        const size = 0.7 + closeness * 1.6;
        back.globalAlpha = star.brightness * (0.45 + closeness * 0.55);
        back.fillStyle = STAR_COLOR;
        back.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    back.globalAlpha = 1;
    front.globalAlpha = 1;
  }

  function frame(now) {
    // Jump strength rises then falls over JUMP_MS (a smooth hump from 0 to 1 and back)
    const t = (now - jumpStart) / JUMP_MS;
    const warp = t >= 0 && t < 1 ? Math.sin(Math.PI * t) ** 1.5 : 0;
    draw(warp);
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(els.stars);
  resize();
  if (!still) requestAnimationFrame(frame);

  return { jump() { if (!still) jumpStart = performance.now(); } };
})();

// Ask the server to put us in this country's room and send its recent messages
function joinRoom() {
  if (!selected) return;
  const feature = selected;
  els.messages.replaceChildren();
  els.empty.textContent = 'Loading comments…';
  setUnread(0);

  socket.emit('join', codeOf(feature), (res) => {
    // If the user clicked a different country before the reply came back, ignore it
    if (selected !== feature) return;
    if (!res?.ok) return showStatus(res?.error || 'Could not join chat');
    els.empty.textContent = `No comments on ${nameOf(feature)} yet. Start the conversation.`;
    res.messages.forEach(renderMessage);
  });
}

// =====================================================
//  Chat panel
// =====================================================
function setChatEnabled(enabled) {
  els.input.disabled = !enabled;
  els.send.disabled = !enabled;
  els.close.hidden = !enabled;
  els.online.textContent = '';
  showStatus('');

  els.expandLabel.textContent = enabled ? nameOf(selected) : 'Chat';

  if (enabled) {
    const name = nameOf(selected);
    els.title.textContent = `${name} chat`;
    els.input.placeholder = `Comment on ${name} news…`;
    els.input.focus();
  } else {
    els.title.textContent = 'Country chat';
    els.input.placeholder = 'Select a country to use chat';
    els.input.value = '';
    els.messages.replaceChildren();
    els.empty.textContent = 'Select a country to use chat';
  }
}

function renderMessage(msg) {
  const mine = msg.user === myName;
  const li = document.createElement('li');
  li.className = mine ? 'msg mine' : 'msg';

  // Top line: who sent it on the left, time on the right
  const meta = document.createElement('div');
  meta.className = 'meta';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = mine ? 'You' : msg.user;
  const when = document.createElement('time');
  when.className = 'when';
  when.dateTime = new Date(msg.ts).toISOString();
  when.textContent = new Date(msg.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  meta.append(who, when);

  // textContent (not innerHTML) so nobody can inject HTML or scripts into the page
  const body = document.createElement('p');
  body.textContent = msg.text;

  li.append(meta, body);
  els.messages.append(li);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function showStatus(text) {
  els.status.textContent = text;
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text || !selected) return;

  els.input.value = '';
  socket.emit('message', text, (res) => {
    if (res?.ok) return showStatus('');
    els.input.value = text;            // give the text back so it isn't lost
    showStatus(res?.error || 'Message not sent');
  });
});

els.close.addEventListener('click', () => selectCountry(null));

// =====================================================
//  Retractable chat panel
// =====================================================
function setCollapsed(value) {
  collapsed = value;
  els.layout.classList.toggle('chat-collapsed', collapsed);   // style.css does the hiding
  els.collapse.setAttribute('aria-expanded', String(!collapsed));
  els.expand.setAttribute('aria-expanded', String(!collapsed));

  if (!collapsed) {
    setUnread(0);
    els.messages.scrollTop = els.messages.scrollHeight;
    if (selected) els.input.focus();
  }
  // Remember the choice for next visit (wrapped in try because some browsers block storage)
  try { localStorage.setItem('chatCollapsed', collapsed ? '1' : '0'); } catch {}
}

function setUnread(count) {
  unread = count;
  els.unread.textContent = count === 0 ? '' : count > 99 ? '99+' : String(count);
}

els.collapse.addEventListener('click', () => setCollapsed(true));
els.expand.addEventListener('click', () => setCollapsed(false));

let startCollapsed = false;
try { startCollapsed = localStorage.getItem('chatCollapsed') === '1'; } catch {}
setCollapsed(startCollapsed);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') selectCountry(null);
});

// =====================================================
//  Socket events from the server
// =====================================================
socket.on('welcome', ({ name }) => {
  myName = name;
  els.me.textContent = `Chatting as ${name}`;
});

socket.on('message', (msg) => {
  if (!selected || msg.country !== codeOf(selected)) return;
  renderMessage(msg);
  if (collapsed && msg.user !== myName) setUnread(unread + 1);   // badge on the hidden tab
});

socket.on('presence', ({ country, count }) => {
  if (selected && country === codeOf(selected)) els.online.textContent = `${count} online`;
});

// Connection light in the top bar
function setLink(state, text) {
  els.link.dataset.state = state;
  els.linkText.textContent = text;
}

// If the connection drops and comes back, rejoin the room we were in
socket.on('connect', () => {
  setLink('connected', 'Connected');
  showStatus('');
  if (selected) joinRoom();
});
socket.on('disconnect', () => {
  setLink('lost', 'Reconnecting');
  showStatus('Connection lost. Reconnecting…');
});
