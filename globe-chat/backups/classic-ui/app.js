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
  .backgroundColor('rgba(0,0,0,0)')
  .atmosphereColor('#5fa8ff')
  .polygonSideColor(() => 'rgba(255,255,255,0.06)')
  .polygonStrokeColor(() => 'rgba(255,255,255,0.35)')
  .polygonLabel((f) => `<b>${nameOf(f)}</b>`)
  .polygonsTransitionDuration(200)
  .onPolygonHover((f) => {
    hovered = f;
    els.globe.style.cursor = f ? 'pointer' : 'grab';
    refreshGlobe();
  })
  .onPolygonClick((f, _event, coords) => selectCountry(f, coords))
  .onGlobeClick(() => selectCountry(null));   // clicking the ocean deselects

globe.globeMaterial().color.set('#0b1d33');
globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.4;

// Passing new accessor functions tells globe.gl to recolor the countries
function refreshGlobe() {
  globe
    .polygonAltitude((f) => (f === selected ? 0.05 : f === hovered ? 0.02 : 0.008))
    .polygonCapColor((f) =>
      f === selected ? '#3d8bfd' : f === hovered ? 'rgba(120,180,255,0.8)' : 'rgba(170,190,215,0.55)'
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
    globe.controls().autoRotate = true;
    return;
  }

  globe.controls().autoRotate = false;
  if (coords) globe.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.8 }, 800);

  setChatEnabled(true);
  joinRoom();
}

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
  const li = document.createElement('li');
  li.className = msg.user === myName ? 'msg mine' : 'msg';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  meta.textContent = `${msg.user} · ${time}`;

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

// If the connection drops and comes back, rejoin the room we were in
socket.on('connect', () => {
  if (selected) joinRoom();
});
socket.on('disconnect', () => showStatus('Reconnecting…'));
