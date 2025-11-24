const FETCH_CREDENTIALS = 'include';
let currentUser = null;
let editingEventId = null;
const eventIndex = new Map();

// i18n fallback functions
if (typeof window.t !== 'function') {
  window.t = (key, params) => {
    let result = key;
    if (params) {
      Object.keys(params).forEach(k => {
        result = result.replace(new RegExp(`{${k}}`, 'g'), params[k]);
      });
    }
    return result;
  };
}

if (typeof window.getLanguage !== 'function') {
  window.getLanguage = () => {
    try {
      return localStorage.getItem('language') || 'tr';
    } catch {
      return 'tr';
    }
  };
}

if (typeof window.setLanguage !== 'function') {
  window.setLanguage = (lang) => {
    try {
      localStorage.setItem('language', lang);
    } catch {}
  };
}

const DISABLE_TYPE_PICKER = true;         
const PUBLIC_HIDE_EXPORT_BUTTON = true;

const BODY = document.body;
function setBodyMode(mode){
  BODY.classList.remove('public-fullmap','login-fullmap','user-fullmap');
  if (mode) BODY.classList.add(mode);
}

/* --- Developer guards --- */
const FORCE_DEFAULT_LOGIN_ON_LOAD = true;
const ALWAYS_REDIRECT_TO_DEFAULT_LOGIN = true;

const AUTH_KEY = 'auth_token';
let authToken = null;

/* ==================== GLOBAL CONFIG ==================== */
let APP_CONFIG = {
  siteTitle: null,
  siteLogoUrl: null,
  allowedEmailDomains: [],
  pageSizeEvents: null,
  pageSizeTypes: null,
  pageSizeUsers: null,

  mapInitialLat: null,
  mapInitialLng: null,
  mapInitialZoom: null,
  mapMinZoom: null,
  showGoodEventsOnLogin: null,
  showBadEventsOnLogin: null
};

async function loadAppConfig() {
  try {
    const resp = await fetch('/api/config');
    if (resp.ok) {
      const config = await resp.json();
      if (typeof config.showGoodEventsOnLogin === 'string') {
        config.showGoodEventsOnLogin = config.showGoodEventsOnLogin.toLowerCase() === 'true';
      }
      if (typeof config.showBadEventsOnLogin === 'string') {
        config.showBadEventsOnLogin = config.showBadEventsOnLogin.toLowerCase() === 'true';
      }
      if (config.mapInitialLat) config.mapInitialLat = Number(config.mapInitialLat);
      if (config.mapInitialLng) config.mapInitialLng = Number(config.mapInitialLng);
      if (config.mapInitialZoom) config.mapInitialZoom = Number(config.mapInitialZoom);
      if (config.mapMinZoom) config.mapMinZoom = Number(config.mapMinZoom);
      if (config.pageSizeEvents) config.pageSizeEvents = Number(config.pageSizeEvents);
      if (config.pageSizeTypes) config.pageSizeTypes = Number(config.pageSizeTypes);
      if (config.pageSizeUsers) config.pageSizeUsers = Number(config.pageSizeUsers);
      
      APP_CONFIG = { ...APP_CONFIG, ...config };
      
      if (map) {
        const minZoom = Number(APP_CONFIG.mapMinZoom) || 2;
        const lat = Number(APP_CONFIG.mapInitialLat) || 39.9334;
        const lng = Number(APP_CONFIG.mapInitialLng) || 32.8597;
        const zoom = Number(APP_CONFIG.mapInitialZoom) || 6;
        
        map.setMinZoom(minZoom);
        map.setMaxZoom(18);
        map.setView([lat, lng], zoom, { animate: false });
        map.invalidateSize();
      } else {
        createOrUpdateMapFromConfig();
      }
    }
  } catch (e) {
    console.error('[CONFIG] Could not load:', e);
    if (!map) createOrUpdateMapFromConfig();
  }
}

function createOrUpdateMapFromConfig() {
  const minZoom = Number(APP_CONFIG.mapMinZoom);
  const lat = Number(APP_CONFIG.mapInitialLat);
  const lng = Number(APP_CONFIG.mapInitialLng);
  const zoom = Number(APP_CONFIG.mapInitialZoom);

  if (!map) {
    map = L.map('map', {
      zoomControl: false,
      minZoom: minZoom,
      maxZoom: 18,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false
    }).setView([lat, lng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© OpenStreetMap contributors',
      noWrap: true,
      bounds: WORLD_BOUNDS
    }).addTo(map);

    if (!markersLayer) {
      markersLayer = makeMarkersLayer().addTo(map);
    }

    fitMapHeight();
    window.addEventListener('resize', () => {
      fitMapHeight();
      map.invalidateSize();
    });
  } else {
    map.setMinZoom(minZoom);
    map.setMaxZoom(18);
    map.setView([lat, lng], zoom, { animate: false });
    map.invalidateSize();
  }
  ensureMapLegend(map);
}

function loadToken() {
  try { authToken = localStorage.getItem(AUTH_KEY) || null; } catch { authToken = null; }
}
function saveToken(t) {
  authToken = t || null;
  try {
    if (authToken) localStorage.setItem(AUTH_KEY, authToken);
    else localStorage.removeItem(AUTH_KEY);
  } catch {}
}

(function patchFetch(){
  const _fetch = window.fetch.bind(window);
  window.fetch = (url, opts = {}) => {
    const o = { ...opts };
    o.headers = { ...(opts.headers || {}) };
    if (authToken) o.headers['Authorization'] = `Bearer ${authToken}`;
    if (o.credentials == null) o.credentials = FETCH_CREDENTIALS;
    return _fetch(url, o);
  };
})();

const qs  = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

const show = el => { if (el && el.classList) el.classList.remove('hidden'); };
const hide = el => { if (el && el.classList) el.classList.add('hidden'); };

const setError   = (el, msg)=>{ if (!el) return; el.textContent = msg; show(el); };
const clearError = el => { if (!el) return; el.textContent=''; hide(el); };

function ensureToastRoot(){
  let r = qs('#toast-root');
  if (!r){
    r = document.createElement('div');
    r.id = 'toast-root';
    document.body.appendChild(r);
  }
  return r;
}

function toast(message, type='success', timeout=2400){
  const root = ensureToastRoot();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  const t = setTimeout(()=>{ try{ el.remove(); }catch{} }, timeout);
  el.addEventListener('click', ()=>{ clearTimeout(t); try{ el.remove(); }catch{} });
}

/* Media (multiple URL — backend TEXT(JSON)) */
let photoUrls = [];
let videoUrls = [];
let lastSelectedEventType = '';

/* === Theme === */
const THEME_KEY = 'theme';
const themeBtn = () => qs('#btn-theme-toggle');

function bulbSVG(on=true){
  const fill = on ? '#facc15' : 'none';
  const stroke = on ? '#a16207' : '#6b7280';
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="${fill}" stroke="${stroke}" stroke-width="1.6">
        <path d="M8 17a4 4 0 0 1 .94-2.6l.39-.46A6.5 6.5 0 1 1 14.67 14l.39.46A4 4 0 0 1 16 17H8Z"/>
        <rect x="8" y="17" width="8" height="2" rx="1"></rect>
        <rect x="9" y="20" width="6" height="2" rx="1"></rect>
      </g>
    </svg>`;
}

function setTheme(mode){
  const root = document.documentElement;
  if(mode === 'dark'){
    root.classList.remove('theme-light');
    root.classList.add('theme-dark');
    const b = themeBtn(); if (b) b.innerHTML = bulbSVG(false);
  }else{
    root.classList.remove('theme-dark');
    root.classList.add('theme-light');
    const b = themeBtn(); if (b) b.innerHTML = bulbSVG(true);
  }
  try{ localStorage.setItem(THEME_KEY, mode); }catch{}
}

function applySavedTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch{}
  setTheme(saved === 'dark' ? 'dark' : 'light');
}

function wireEyes(){
  qsa('.eye-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const id=btn.getAttribute('data-eye');
      const inp=qs('#'+id);
      if(!inp) return;
      inp.type = inp.type==='password' ? 'text':'password';
    };
  });
}

const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^\w\s]).{8,}$/;
function isStrongPassword(pw){ return PW_REGEX.test(String(pw||'')); }

async function applySiteConfig(){
  try{
    const r = await fetch('/api/config');
    if(!r.ok) throw 0;
    const cfg = await r.json();
    
    APP_CONFIG.siteTitle = cfg.siteTitle;
    APP_CONFIG.allowedEmailDomains = cfg.allowedDomains;
    
    if(cfg.siteTitle){
      document.title = cfg.siteTitle;
      const st = qs('#site-title'); if (st) st.textContent = cfg.siteTitle;
    }
    const logo = qs('#site-logo'); const fav = document.getElementById('site-favicon');
    if (logo) {
      logo.onerror = ()=>hide(logo);
      if(cfg.siteLogoUrl && typeof cfg.siteLogoUrl==='string' && cfg.siteLogoUrl.trim()){
        logo.src = cfg.siteLogoUrl; show(logo);
        if (fav) fav.href = cfg.siteLogoUrl;
      } else hide(logo);
    }
    if(cfg.allowedDomains && Array.isArray(cfg.allowedDomains) && cfg.allowedDomains.length){
      const d=qs('#allowed-domain');
      if (d){ 
        d.textContent = cfg.allowedDomains.length === 1 
          ? t('allowedDomainSingular', { domain: cfg.allowedDomains[0] })
          : t('allowedDomainsPlural', { domains: cfg.allowedDomains.join(', ') });
        show(d); 
      }
    }
  }catch{
    const st = qs('#site-title'); if (st) st.textContent = t('application');
  }
}

function setMediaButtonsAsIcons(){
  const bp = qs('#btn-add-photo');
  const bv = qs('#btn-add-video');

  const makeIconOnly = (btn) => {
    btn.classList.add('icon-btn');             
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '0';
    btn.style.minWidth = '40px';
    btn.style.minHeight = '36px';
  };

  if (bp) {
    bp.innerHTML = `<img id="ico-photo" src="/camera.svg" alt="" width="22" height="22" loading="lazy" />`;
    bp.setAttribute('aria-label', t('addPhoto'));
    bp.title = t('addPhoto');
    makeIconOnly(bp);
    const ip = bp.querySelector('#ico-photo');
    if (ip) ip.onerror = () => { ip.outerHTML = buttonPhotoSVG(); };
  }

  if (bv) {
    bv.innerHTML = `<img id="ico-video" src="/video.svg" alt="" width="22" height="22" loading="lazy" />`;
    bv.setAttribute('aria-label', t('addVideo'));
    bv.title = t('addVideo');
    makeIconOnly(bv);
    const iv = bv.querySelector('#ico-video');
    if (iv) iv.onerror = () => { iv.outerHTML = buttonVideoSVG(); };
  }
}

function placeMicIntoMediaBar(){
  const extraMics = document.querySelectorAll('#media-bar #btn-stt, .media-mic, .mic-inline');
  extraMics.forEach(el => el.remove());
  
  const mediaBar = qs('#media-bar');
  const videoBtn = qs('#btn-add-video');
  const headerLocBtn = qs('#btn-use-location');
  
  if (mediaBar && headerLocBtn && videoBtn && !mediaBar.querySelector('.media-loc-btn')) {
    const locBtn = document.createElement('button');
    locBtn.className = 'btn ghost icon-btn media-loc-btn';
    locBtn.id = 'media-loc-btn';
    locBtn.innerHTML = `<img src="/useposition.svg" alt="${t('location')}" width="20" height="20" />`;
    locBtn.title = t('useMyLocation');
    locBtn.style.display = 'inline-flex';
    locBtn.style.alignItems = 'center';
    locBtn.style.justifyContent = 'center';
    locBtn.onclick = () => {
      geoFindMeToggle();
      const olayCard = qs('#olay-card');
      if (olayCard && currentUser && currentUser.role === 'user') {
        show(olayCard);
        ensureBackButton();
      }
    };
    
    videoBtn.insertAdjacentElement('afterend', locBtn);
  }
}

/* ----------------- Map ----------------- */
const WORLD_BOUNDS = L.latLngBounds([-85, -180], [85, 180]);

function makeMarkersLayer() {
  if (L.markerClusterGroup) {
    return L.markerClusterGroup({
      spiderfyOnEveryZoom: false,
      chunkedLoading: true
    });
  }
  return L.layerGroup();
}

let map = null;
let markersLayer = null;
let clickMarker = null;

let eventsMap = null;
let eventsMarkersLayer = null;
let __eventsExportCtrlAdded = false;

/* === GeoJSON Download Control === */
let __exportCtrlAdded = false;

function ensureExportControl() {
  removeDownloadIfAny();
  __exportCtrlAdded = false;
}

function ensureMapLegend(mapInstance) {
  if (!mapInstance) return;
  
  if (!shouldShowLegend()) {
    const existing = mapInstance.getContainer().querySelector('.map-legend');
    if (existing) existing.remove();
    return;
  }
  
  const existingLegend = mapInstance.getContainer().querySelector('.map-legend');
  if (existingLegend) {
    return;
  }
  
  const Legend = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function() {
      const div = L.DomUtil.create('div', 'map-legend');
      
      div.style.cssText = `
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        z-index: 1000 !important;
        position: relative !important;
      `;
      
      div.innerHTML = `
        <div class="legend-title">${t('eventIcons')}</div>
        <div class="legend-item">
          <svg width="20" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="#10b981" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
          <span>${t('myEvent')}</span>
        </div>
        <div class="legend-item">
          <svg width="20" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="#3b82f6" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
          <span>${t('otherEvents')}</span>
        </div>
        <div class="legend-item">
          <svg width="20" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0,3)">
              <rect x="3" y="5" width="18" height="12" rx="3" fill="#3b82f6"/>
              <rect x="7" y="3" width="6" height="3" rx="1" fill="#3b82f6"/>
              <circle cx="12" cy="11" r="3.2" fill="rgba(255,255,255,.9)"/>
            </g>
          </svg>
          <span>${t('withPhoto')}</span>
        </div>
        <div class="legend-item">
          <svg width="20" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0,3)">
              <rect x="3" y="6" width="12" height="10" rx="2" fill="#3b82f6"/>
              <path d="M16 8l5-2v10l-5-2z" fill="#3b82f6"/>
              <rect x="6.8" y="9.2" width="4.4" height="3.6" rx="1" fill="rgba(255,255,255,.9)"/>
            </g>
          </svg>
          <span>${t('withVideo')}</span>
        </div>
        <div class="legend-item">
          <svg width="20" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0,3)">
              <rect x="3" y="5" width="18" height="12" rx="3" fill="#3b82f6"/>
              <path d="M10 9l6 3-6 3z" fill="rgba(255,255,255,.95)"/>
            </g>
          </svg>
          <span>${t('withPhotoAndVideo')}</span>
        </div>
      `;
      
      return div;
    }
  });
  
  mapInstance.addControl(new Legend());
}

function removeDownloadIfAny(){
  try{
    let removed = false;
    document.querySelectorAll('.leaflet-top.leaflet-right .leaflet-bar').forEach(el=>{
      const img = el.querySelector('img[src$="download.svg"]');
      if (img) {
        el.remove();
        removed = true;
      }
    });
    if (removed) __exportCtrlAdded = false;
  }catch{}
}

/* === TABLE EXPORT BUTTON === */
function downloadFilteredEventsAsGeoJSON() {
  const filtered = tableStates?.events?.filtered || [];
  
  if (filtered.length === 0) {
    toast(t('noEventsToDownload'), 'error');
    return;
  }
  
  const eventIds = filtered.map(e => parseInt(e.olay_id, 10)).filter(id => !isNaN(id));
  
  fetch('/api/export/geojson', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ eventIds: eventIds })
  })
  .then(async r => {
    if (!r.ok) {
      const errText = await r.text().catch(() => t('unknownError'));
      throw new Error(t('downloadError') + ': ' + errText);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olaylar_${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 800);
    toast(t('eventsDownloaded'), 'success');
  })
  .catch(err => {
    console.error('[GeoJSON Export Error]', err);
    toast(t('geojsonDownloadFailed') + ': ' + err.message, 'error');
  });
}

function boolFromConfigValue(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v === 1;
  return false;
}

function shouldShowLegend() {
  if (!currentUser) {
    const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
    const showBad  = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);

    if (!showGood && !showBad) {
      return false;
    }
    
    return true;
  }

  if (currentUser.role === 'user') {
    return true;
  }

  if (currentUser.role === 'supervisor') {
    return true;
  }

  if (currentUser.role === 'admin') {
    return true;
  }

  return false;
}

function ensureEventsMap() {
  const host = document.getElementById('events-map');
  if (!host) return;
  
  if (!host.style.height || host.style.height === '400px') {
    const vh = window.innerHeight || 800;
    const desiredHeight = Math.min(500, Math.max(300, vh * 0.4));
    host.style.height = desiredHeight + 'px';
  }
  
  const minZoom = Number(APP_CONFIG.mapMinZoom);
  const lat = Number(APP_CONFIG.mapInitialLat);
  const lng = Number(APP_CONFIG.mapInitialLng);
  const zoom = Number(APP_CONFIG.mapInitialZoom);
  
  if (!eventsMap) {
    eventsMap = L.map('events-map', {
      zoomControl: false,
      minZoom: minZoom,
      maxZoom: 18,
      worldCopyJump: false
    }).setView([lat, lng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© OpenStreetMap contributors'
    }).addTo(eventsMap);

    eventsMarkersLayer = makeMarkersLayer().addTo(eventsMap);
    eventsMap.invalidateSize();
  } else {
    eventsMap.setView([lat, lng], zoom, { animate: false });
    eventsMap.invalidateSize();
  }
  ensureMapLegend(eventsMap);
}

function ensureEventsExportControl() {
  if (__eventsExportCtrlAdded || !eventsMap) return;

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) {
    return;
  }

  const Ctl = L.Control.extend({
    onAdd: function() {
      const wrap = L.DomUtil.create('div','leaflet-bar');
      const btn = L.DomUtil.create('a','',wrap);
      btn.href='#'; 
      btn.title = t('downloadVisibleEventsGeoJSON');
      btn.style.width='34px'; 
      btn.style.height='34px';
      btn.style.display='inline-flex'; 
      btn.style.alignItems='center'; 
      btn.style.justifyContent='center';
      btn.innerHTML = `<img src="/download.svg" alt="" width="18" height="18"/>`;
      L.DomEvent.on(btn, 'click', async (e)=>{
        L.DomEvent.stop(e);
        try{
          const filtered = tableStates?.events?.filtered || [];
          const eventIds = filtered.map(ev => parseInt(ev.olay_id, 10)).filter(id => !isNaN(id));
          
          const r = await fetch('/api/export/geojson', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ eventIds: eventIds })
          });
          if(!r.ok) {
            const errText = await r.text().catch(() => t('unknownError'));
            throw new Error(t('downloadError') + ': ' + errText);
          }
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; 
          a.download = 'events.geojson';
          document.body.appendChild(a); 
          a.click();
          setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 800);
          toast(t('geojsonDownloaded'), 'success');
        }catch(err){ 
          console.error('[ensureEventsExportControl] Export error:', err);
          toast(t('geojsonDownloadFailed') + ':' + err.message, 'error'); 
        }
      });
      return wrap;
    }
  });
  eventsMap.addControl(new Ctl({position:'topright'}));
  __eventsExportCtrlAdded = true;
}

function fitMapHeight() {
  try {
    const header = document.querySelector('header');
    const topH = header ? header.getBoundingClientRect().height : 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;

    if (document.body.classList.contains('supervisor-readonly-map')) {
      const desired = Math.max(240, vh - topH);
      const el = document.getElementById('map');
      if (el) el.style.height = desired + 'px';
      return;
    }

  } catch (err) {
  }
}

/* Live location variables */
let liveWatchId = null;
let liveMarker = null;
let liveAccuracyCircle = null;

let pmStream = null;
let vmStream = null;
let vmRecorder = null;
let vmChunks = [];
let vmRecording = false;

function makeIcon(svg, ax=[14,40]){ return L.divIcon({ className:'', html: svg, iconSize:[28,40], iconAnchor:ax, popupAnchor:[0,-36] }); }

function pinIcon(color='#3b82f6'){
  const html = `
    <svg class="map-pin" width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path fill="${color}" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>`;
  return makeIcon(html);
}

function photoCameraIcon(color='#3b82f6'){
  const html = `
    <svg width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,3)">
        <rect x="3" y="5" width="18" height="12" rx="3" fill="${color}"/>
        <rect x="7" y="3" width="6" height="3" rx="1" fill="${color}"/>
        <circle cx="12" cy="11" r="3.2" fill="rgba(255,255,255,.9)"/>
      </g>
    </svg>`;
  return makeIcon(html, [14,38]);
}

function videoCameraIcon(color='#3b82f6'){
  const html = `
    <svg width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,3)">
        <rect x="3" y="6" width="12" height="10" rx="2" fill="${color}"/>
        <path d="M16 8l5-2v10l-5-2z" fill="${color}"/>
        <rect x="6.8" y="9.2" width="4.4" height="3.6" rx="1" fill="rgba(255,255,255,.9)"/>
      </g>
    </svg>`;
  return makeIcon(html, [14,38]);
}

function buttonPhotoSVG(color='#3b82f6'){
  return `
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="18" height="12" rx="3" fill="${color}"/>
      <rect x="7" y="5" width="6" height="3" rx="1" fill="${color}"/>
      <circle cx="12" cy="13" r="3.2" fill="rgba(255,255,255,.9)"/>
    </svg>`;
}

function buttonVideoSVG(color='#3b82f6'){
  return `
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="8" width="12" height="10" rx="2" fill="${color}"/>
      <path d="M16 10l5-2v10l-5-2z" fill="${color}"/>
    </svg>`;
}

function playButtonIcon(color='#3b82f6'){
  const html = `
    <svg width="28" height="40" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0,3)">
        <rect x="3" y="5" width="18" height="12" rx="3" fill="${color}"/>
        <path d="M10 9l6 3-6 3z" fill="rgba(255,255,255,.95)"/>
      </g>
    </svg>`;
  return makeIcon(html, [14,38]);
}

const BLACK_PIN = ()=>pinIcon('#111');

const COLOR_MINE = '#10b981';
const COLOR_OTHER = '#3b82f6';

function iconForEvent(evt){
  const forceBlue = (window.FORCE_BLUE_MARKERS === true);

  const mine = forceBlue ? false : !!evt.is_mine;
  const color = mine ? COLOR_MINE : COLOR_OTHER;

  const hasPhotos = Array.isArray(evt.photo_urls) && evt.photo_urls.length > 0;
  const hasVideos = Array.isArray(evt.video_urls) && evt.video_urls.length > 0;

  if (hasPhotos && hasVideos) return playButtonIcon(color);
  if (hasPhotos && !hasVideos) return photoCameraIcon(color);
  if (!hasPhotos && hasVideos) return videoCameraIcon(color);
  return pinIcon(color);
}

function markerFor(e){
  return L.marker([parseFloat(e.enlem), parseFloat(e.boylam)], { icon: iconForEvent(e) });
}

let __lightbox = null;

function ensureLightbox(){
  if (__lightbox) return __lightbox;
  const wrap = document.createElement('div');
  wrap.id = 'lightbox';
  wrap.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.85);
    display:none; align-items:center; justify-content:center; z-index:10000;`;
  wrap.innerHTML = `
    <div id="lb-content" style="max-width:96vw;max-height:96vh;"></div>
    <button id="lb-close" aria-label="${t('close')}" style="
      position:absolute; top:10px; right:12px; background:#fff; border:0;
      border-radius:8px; padding:.4rem .6rem; cursor:pointer; z-index:1;">${t('close')}</button>
  `;
  document.body.appendChild(wrap);
  const close = ()=>{ 
    wrap.style.display='none'; 
    wrap.style.zIndex = '10000'; 
    const c=wrap.querySelector('#lb-content'); 
    if (c) c.innerHTML=''; 
  };
  wrap.addEventListener('click', (e)=>{ if (e.target===wrap) close(); });
  wrap.querySelector('#lb-close').addEventListener('click', close);
  document.addEventListener('keydown', e=>{ if (e.key==='Escape') close(); });
  __lightbox = wrap;
  return wrap;
}

function openLightboxImage(src){
  const lb = ensureLightbox();
  const c = lb.querySelector('#lb-content');
  c.innerHTML = `<img src="${src}" alt="" style="max-width:96vw;max-height:96vh;display:block" />`;
  lb.style.zIndex = '10000'; 
  lb.style.display='flex';
}

function openLightboxVideo(src){
  const lb = ensureLightbox();
  const c = lb.querySelector('#lb-content');
  c.innerHTML = `<video src="${src}" controls autoplay style="max-width:96vw;max-height:96vh;display:block;background:#000;border-radius:8px"></video>`;
  lb.style.zIndex = '10000'; 
  lb.style.display='flex';
}

function openLightboxImageInForm(src){
  const lb = ensureLightbox();
  const c = lb.querySelector('#lb-content');
  c.innerHTML = `<img src="${src}" alt="" style="max-width:96vw;max-height:96vh;display:block" />`;
  lb.style.zIndex = '11500'; 
  lb.style.display='flex';
}

function openLightboxVideoInForm(src){
  const lb = ensureLightbox();
  const c = lb.querySelector('#lb-content');
  c.innerHTML = `<video src="${src}" controls autoplay style="max-width:96vw;max-height:96vh;display:block;background:#000;border-radius:8px"></video>`;
  lb.style.zIndex = '11500'; 
  lb.style.display='flex';
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function formatDate(dateStr){
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

/* ==================== CONVERT DATE STRING TO DATE OBJECT ==================== */
function parseDateStr(dateStr) {
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('.');
    const [hour, minute] = (timePart || '00:00').split(':');
    return new Date(year, month - 1, day, hour, minute);
  } catch {
    return new Date(0);
  }
}

/* ==================== DATE FILTER DROPDOWN ==================== */
function buildDateFilterDropdown(data, state) {
  let selectAllChecked = false;
  
  if (!state.filters.date || !Array.isArray(state.filters.date)) {
    selectAllChecked = true;
  } else if (state.filters.date.length === 0) {
    selectAllChecked = false;
  } else {
    const valueCounts = {};
    data.forEach(item => {
      const value = formatDate(item.created_at || item.eklenme_tarihi);
      if (value && value !== '-') {
        valueCounts[value] = (valueCounts[value] || 0) + 1;
      }
    });
    const totalValues = Object.keys(valueCounts).length;
    selectAllChecked = state.filters.date.length === totalValues;
  }
  
  const specialFilters = state.specialFilters || {};
  const newestChecked = specialFilters.sortOrder === 'newest';
  const oldestChecked = specialFilters.sortOrder === 'oldest';
  
  let html = `
    <input type="text" class="filter-search" placeholder="${t('searchPlaceholder')}" />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${selectAllChecked ? 'checked' : ''} />
        <span>(${t('selectAll')})</span>
      </label>
      <label class="filter-option" style="background:#e3f2fd; border-radius:4px; padding:4px 8px;">
        <input type="radio" name="date-sort-order" class="filter-sort-newest" ${newestChecked ? 'checked' : ''} />
        <span>📅 ${t('newestFirst')}</span>
      </label>
      <label class="filter-option" style="background:#fff3e0; border-radius:4px; padding:4px 8px;">
        <input type="radio" name="date-sort-order" class="filter-sort-oldest" ${oldestChecked ? 'checked' : ''} />
        <span>📅 ${t('oldestFirst')}</span>
      </label>
      <hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />
      <div id="custom-date-filters"></div>
  `;
  
  const valueCounts = {};
  data.forEach(item => {
    const value = formatDate(item.created_at || item.eklenme_tarihi);
    if (value && value !== '-') {
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    }
  });
  
  const sortedValues = Object.keys(valueCounts).sort((a, b) => {
    const dateA = parseDateStr(a);
    const dateB = parseDateStr(b);
    return dateB - dateA; 
  });
  
  sortedValues.forEach(value => {
    const count = valueCounts[value];
    
    let checked = false;
    if (!state.filters.date || !Array.isArray(state.filters.date)) {
      checked = true;
    } else if (state.filters.date.length === 0) {
      checked = false;
    } else {
      checked = state.filters.date.includes(value);
    }
    
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(value)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(value)} (${count})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}
/* ==================== EMAIL FILTER DROPDOWN ==================== */
function buildEmailFilterDropdown(data, state) {
  const uniqueEmails = new Set();
  state.data.forEach(item => {
    const email = item.email || '';
    if (email) uniqueEmails.add(email);
  });
  
  const sortedEmails = Array.from(uniqueEmails).sort();
  
  const emailCounts = {};
  sortedEmails.forEach(email => {
    emailCounts[email] = 0;
  });
  
  state.filtered.forEach(item => {
    const email = item.email || '';
    if (email && emailCounts.hasOwnProperty(email)) {
      emailCounts[email]++;
    }
  });
  
  const activeDomains = new Set();
  
  state.data.forEach(item => {
    const email = item.email || '';
    const match = email.match(/@(.+)$/);
    if (match) {
      activeDomains.add(match[1]);
    }
  });
  
  const domainCounts = {};
  activeDomains.forEach(domain => {
    domainCounts[domain] = 0;
  });
  
  state.filtered.forEach(item => {
    const email = item.email || '';
    const match = email.match(/@(.+)$/);
    if (match) {
      const domain = match[1];
      if (activeDomains.has(domain)) {
        domainCounts[domain]++;
      }
    }
  });
  
  const sortedDomains = Array.from(activeDomains).sort();
  
  const specialFilters = state.specialFilters || {};
  const allEmailsSelected = !state.filters.email || state.filters.email.length === sortedEmails.length;
  const allDomainsSelected = !specialFilters.emailDomains || specialFilters.emailDomains.length === sortedDomains.length;
  const selectAllChecked = allEmailsSelected && allDomainsSelected;
  
  let html = `
    <input type="text" class="filter-search" placeholder="${t('searchCommonWord')}" />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${selectAllChecked ? 'checked' : ''} />
        <span>(${t('selectAll')})</span>
      </label>
  `;
  
  if (sortedDomains.length > 0) {
    html += `<div style="font-weight:600; font-size:0.85rem; color:var(--primary); margin:8px 0 4px 0;">📧 ${t('emailDomains')}:</div>`;
    
    sortedDomains.forEach(domain => {
      const count = domainCounts[domain] || 0;
      const checked = !specialFilters.emailDomains || specialFilters.emailDomains.includes(domain);
      html += `
        <label class="filter-option special-filter-item" style="background:#e3f2fd; border-radius:4px; padding:4px 8px; margin:2px 0;">
          <input type="checkbox" class="filter-email-domain" data-domain="${escapeHtml(domain)}" ${checked ? 'checked' : ''} />
          <span style="font-weight:500;">@${escapeHtml(domain)} (${count})</span>
        </label>
      `;
    });
    
    html += '<hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />';
  }
  
  sortedEmails.forEach(email => {
    const count = emailCounts[email] || 0;
    
    let checked = false;
    if (state.filters.email && state.filters.email.length > 0) {
      checked = state.filters.email.includes(email);
    } else if (specialFilters.emailDomains && specialFilters.emailDomains.length > 0) {
      const match = email.match(/@(.+)$/);
      if (match) {
        checked = specialFilters.emailDomains.includes(match[1]);
      }
    } else {
      checked = true;
    }
    
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(email)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(email)} (${count})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}

/* ==================== UPDATE CUSTOM DATE FILTERS ==================== */
function updateCustomDateFilters(dropdown, query, data) {
  const container = dropdown.querySelector('#custom-date-filters');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!query) return;
  
  const q = query.toLowerCase().trim();
  const customFilters = [];
  
  
  const yearMatch = q.match(/\b(\d{4})\b/g);
  if (yearMatch) {
    yearMatch.forEach(year => {
      customFilters.push({ type: 'year', value: parseInt(year), label: `📅 ${t('yearFilter', {year})}` });
    });
  }
  
  const monthsStr = t('months');
  const months = Array.isArray(monthsStr) ? monthsStr : (typeof monthsStr === 'string' ? monthsStr.split(',').map(m => m.trim()) : []);

  months.forEach((month, idx) => {
    if (month && q.includes(month.toLowerCase())) {
      customFilters.push({ type: 'month', value: idx + 1, label: `📅 ${t('monthFilter', {month: month.charAt(0).toUpperCase() + month.slice(1)})}` });
    } 
  });
  
  const dayMatch = q.match(/\b(\d{1,2})\b/g);
  if (dayMatch) {
    dayMatch.forEach(day => {
      const d = parseInt(day, 10);
      if (d >= 1 && d <= 31 && !yearMatch?.includes(day)) {
        customFilters.push({ type: 'day', value: d, label: `📅 ${t('dayFilter', {day: d})}` });
      }
    });
  }
  
  const timeMatch = q.match(/\b(\d{1,2}):(\d{2})\b/g);
  if (timeMatch) {
    timeMatch.forEach(time => {
      customFilters.push({ type: 'time', value: time, label: `🕐 ${time}` });
    });
  }
  
  const rangeRegex = /(\d+)\s*(?:yılından|yıldan|'ten|'den|'dan|den|dan)\s*(\d+)\s*(?:yılına|yıla|'e|'a|e|a)/gi;
  let rangeMatch;
  while ((rangeMatch = rangeRegex.exec(q)) !== null) {
    const start = rangeMatch[1];
    const end = rangeMatch[2];
    
    if (start.length === 4 && end.length === 4) {
      customFilters.push({ type: 'yearRange', start: parseInt(start), end: parseInt(end), label: `📅 ${t('yearRangeFilter', {start, end})}` });
    }
    else if (parseInt(start) <= 31 && parseInt(end) <= 31) {
      customFilters.push({ type: 'dayRange', start: parseInt(start), end: parseInt(end), label: `📅 ${t('dayRangeFilter', {start, end})}` });
    }
  }
  
  const timeRangeRegex = /(\d{1,2}:\d{2})\s*(?:'ten|'den|'dan|den|dan)\s*(\d{1,2}:\d{2})\s*(?:'e|'a|e|a)/gi;
  let timeRangeMatch;
  while ((timeRangeMatch = timeRangeRegex.exec(q)) !== null) {
    const startTime = timeRangeMatch[1];
    const endTime = timeRangeMatch[2];
    customFilters.push({ type: 'timeRange', start: startTime, end: endTime, label: `🕐 ${t('timeRangeFilter', {start: startTime, end: endTime})}` });
  }
  
  if (customFilters.length > 0) {
    container.innerHTML = `<div style="font-weight:600; font-size:0.85rem; color:var(--primary); margin:8px 0 4px 0;">🔍 ${t('customFilters')}:</div>`;
    
    customFilters.forEach((filter, idx) => {
      const id = `custom-filter-${idx}`;
      container.innerHTML += `
        <label class="filter-option" style="background:#f3e5f5; border-radius:4px; padding:4px 8px; margin:2px 0;">
          <input type="checkbox" class="filter-custom" data-filter='${JSON.stringify(filter)}' id="${id}" />
          <span style="font-weight:500;">${escapeHtml(filter.label)}</span>
        </label>
      `;
    });
    
    setTimeout(() => {
      container.querySelectorAll('.filter-custom').forEach(cb => {
        cb.addEventListener('change', () => {
          applyCustomDateFilters('events');
        });
      });
    }, 10);
  }
}

/* ==================== APPLY CUSTOM DATE FILTERS ==================== */
function applyCustomDateFilters(tableKey) {
  const state = tableStates[tableKey];
  const dropdown = document.querySelector(`#${tableKey}-table .filter-dropdown[data-column="date"]`);
  if (!dropdown) return;
  
  const customBoxes = Array.from(dropdown.querySelectorAll('.filter-custom:checked'));
  
  if (customBoxes.length === 0) {
    applyFilters(tableKey);
    return;
  }
  
  const filters = customBoxes.map(cb => JSON.parse(cb.getAttribute('data-filter')));
  
  state.filtered = state.data.filter(item => {
    const rawDate = item.created_at || item.eklenme_tarihi;
    if (!rawDate) return false;
    
    const dateObj = new Date(rawDate);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const time = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    
    return filters.every(filter => {
      switch (filter.type) {
        case 'year':
          return year === filter.value;
        case 'month':
          return month === filter.value;
        case 'day':
          return day === filter.value;
        case 'time':
          return time === filter.value;
        case 'yearRange':
          return year >= filter.start && year <= filter.end;
        case 'dayRange':
          return day >= filter.start && day <= filter.end;
        case 'timeRange':
          const [startH, startM] = filter.start.split(':').map(Number);
          const [endH, endM] = filter.end.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          const currentMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
          return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        default:
          return true;
      }
    });
  });
  
  state.currentPage = 1;
  renderTable(tableKey);
  updateFilterIcon(tableKey, 'date');
}

/* ==================== APPLY SORT FILTER ==================== */
function applySortFilter(sortType) {
  const state = tableStates.events;
  
  if (!state.specialFilters) state.specialFilters = {};
  state.specialFilters.sortOrder = sortType;
  
  if (!sortType) {
    state.filtered = [...state.data];
  } else {
    state.filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || a.eklenme_tarihi || 0);
      const dateB = new Date(b.created_at || b.eklenme_tarihi || 0);
      
      if (sortType === 'newest') {
        return dateB - dateA; 
      } else {
        return dateA - dateB; 
      }
    });
  }
  
  state.currentPage = 1;
  renderTable('events');
  updateFilterIcon('events', 'date');
}

/* ==================== APPLY EMAIL DOMAIN FILTERS ==================== */
function applyEmailDomainFilters(tableKey) {
  const state = tableStates[tableKey];
  const dropdown = document.querySelector(`#${tableKey}-table .filter-dropdown[data-column="email"]`);
  if (!dropdown) return;
  
  const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-email-domain:checked'))
    .map(cb => cb.getAttribute('data-domain'));
  
  if (!state.specialFilters) state.specialFilters = {};
  state.specialFilters.emailDomains = checkedDomains;
  
  const selectedEmails = state.filters.email || [];
  
  if (checkedDomains.length === 0 && selectedEmails.length === 0) {
    state.filtered = [];
    state.currentPage = 1;
    renderTable(tableKey);
    updateFilterIcon(tableKey, 'email');
    return;
  }
  
  state.filtered = state.data.filter(item => {
    const email = item.email || '';
    
    const inDomain = checkedDomains.length > 0 && checkedDomains.some(domain => email.endsWith('@' + domain));
    const inSelected = selectedEmails.length > 0 && selectedEmails.includes(email);
    
    return inDomain || inSelected;
  });
  
  const selectAllBox = dropdown.querySelector('.filter-select-all');
  if (selectAllBox) {
    const allDomainBoxes = dropdown.querySelectorAll('.filter-email-domain');
    const allCheckboxes = dropdown.querySelectorAll('.filter-checkbox');
    const checkedCheckboxes = dropdown.querySelectorAll('.filter-checkbox:checked');
    
    selectAllBox.checked = checkedDomains.length === allDomainBoxes.length && checkedCheckboxes.length === allCheckboxes.length;
  }
  
  state.currentPage = 1;
  renderTable(tableKey);
  updateFilterIcon(tableKey, 'email');
}

/* ==================== TABLE FILTERING AND PAGINATION ==================== */

const tableStates = {
  types: { 
    data: [], 
    filtered: [], 
    filters: {}, 
    currentPage: 1, 
    pageSize: null,
    sortColumn: null,
    sortDirection: 'asc'
  },
  users: { 
    data: [], 
    filtered: [], 
    filters: {}, 
    currentPage: 1, 
    pageSize: null,
    sortColumn: null,
    sortDirection: 'asc',
    specialFilters: {}
  },
  events: { 
    data: [], 
    filtered: [], 
    filters: {}, 
    currentPage: 1, 
    pageSize: null,
    sortColumn: null,
    sortDirection: 'asc',
    specialFilters: {}
  }
};
function resetAllTableFiltersOnLanguageChange() {
  Object.keys(tableStates).forEach(key => {
    const state = tableStates[key];
    if (!state) return;
    state.filters = {};
    if (state.specialFilters) {
      state.specialFilters = {};
    }
    state.filtered = Array.isArray(state.data) ? [...state.data] : [];
    state.currentPage = 1;
  });
  qsa('.filter-dropdown.show').forEach(d => d.classList.remove('show'));
  ['types', 'users', 'events'].forEach(key => {
    if (tableStates[key]) {
      renderTable(key);
    }
  });
  ['types', 'users', 'events'].forEach(key => {
    try {
      attachFilterEvents(key);
    } catch (e) {
      console.warn('attachFilterEvents failed for', key, e);
    }
  });
}

function patchSetLanguageForFilters() {
  const current = window.setLanguage;

  if (typeof current === 'function' && current.__filtersWrapped) {
    return;
  }
  const original = (typeof current === 'function')
    ? current
    : function(lang) {
        try { localStorage.setItem('language', lang); } catch {}
      };

  function wrappedSetLanguage(lang) {
    original(lang);
    setTimeout(() => {
      resetAllTableFiltersOnLanguageChange();
    }, 80);
  }
  wrappedSetLanguage.__filtersWrapped = true;
  window.setLanguage = wrappedSetLanguage;
}

patchSetLanguageForFilters();
document.addEventListener('DOMContentLoaded', patchSetLanguageForFilters);
function applyFilters(tableKey) {
  const state = tableStates[tableKey];
  if (!state) return;
  
  if (Object.keys(state.filters).length === 0) {
    state.filtered = [...state.data];
    state.currentPage = 1;
    renderTable(tableKey);
    return;
  }
  
  state.filtered = state.data.filter(item => {
    for (const [column, selectedValues] of Object.entries(state.filters)) {
      if (Array.isArray(selectedValues) && selectedValues.length === 0) {
        return false;
      }
      
      if (!selectedValues) continue;
      
      let itemValue = '';
      
      switch(tableKey) {
        case 'types':
          if (column === 'name') itemValue = item.o_adi || '';
          if (column === 'good') itemValue = (item.good === true || item.good === 'true' || item.good === 1) ? t('beneficial') : t('notBeneficial');
          if (column === 'creator') itemValue = item.created_by_name || '-';
          break;
        case 'users':
          if (column === 'username') itemValue = item.username || '';
          if (column === 'role') itemValue = item.role || '';
          if (column === 'email') itemValue = item.email || '';
          if (column === 'verified') itemValue = item.email_verified ? t('yes') : t('no');
          break;
        case 'events':
          if (column === 'type') itemValue = item.olay_turu_adi || '-';
          if (column === 'creator') itemValue = item.created_by_username || '-';
          if (column === 'photo') itemValue = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? t('available') : t('notAvailable');
          if (column === 'video') itemValue = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? t('available') : t('notAvailable');
          if (column === 'date') itemValue = formatDate(item.created_at || item.eklenme_tarihi);
          break;
      }
      
      if (!selectedValues.includes(itemValue)) return false;
    }
    return true;
  });
  
  state.currentPage = 1; 
  renderTable(tableKey);
}

/* ==================== DATE SEARCH HELPER ==================== */
function matchDateQuery(dateStr, query) {
  if (!dateStr || !query) return false;
  
  if (dateStr.toLowerCase().includes(query)) return true;
  
  try {
    const monthsStr = t('months');
    const months = Array.isArray(monthsStr) ? monthsStr : (typeof monthsStr === 'string' ? monthsStr.split(',').map(m => m.trim()) : []);
    
    const parts = dateStr.split(' ')[0].split('.');
    if (parts.length !== 3) return false;
    
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = (months[monthIndex] || '').toLowerCase();
    
    const q = query.toLowerCase().trim();
    
    if (/^\d{4}$/.test(q) && year === q) return true;
    
    if (monthName && monthName.includes(q)) return true;
    
    if (/^\d{1,2}$/.test(q) && month === q.padStart(2, '0')) return true;

    if (/^\d{1,2}$/.test(q) && parseInt(q) <= 31 && day === q.padStart(2, '0')) return true;

    if (q.includes(' ')) {
      const parts = q.split(' ').filter(p => p);
      if (parts.length === 2) {
        const [p1, p2] = parts;
        if (/^\d{4}$/.test(p2) && p2 === year) {
          if (monthName.includes(p1) || month === p1.padStart(2, '0')) {
            return true;
          }
        }
        if (/^\d{1,2}$/.test(p1) && day === p1.padStart(2, '0')) {
          if (monthName.includes(p2) || month === p2.padStart(2, '0')) {
            return true;
          }
        }
      }
      if (parts.length === 3) {
        const [qDay, qMonth, qYear] = parts;
        if (/^\d{1,2}$/.test(qDay) && /^\d{4}$/.test(qYear)) {
          if (day === qDay.padStart(2, '0') && year === qYear) {
            if (monthName.includes(qMonth) || month === qMonth.padStart(2, '0')) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  } catch (e) {
    console.warn('matchDateQuery error:', e);
    return false;
  }
}

function buildFilterDropdown(tableKey, column, data) {
  const state = tableStates[tableKey];

  if (tableKey === 'events' && column === 'date') {
    return buildDateFilterDropdown(data, state);
  }
  
  if (tableKey === 'users' && column === 'email') {
    return buildEmailFilterDropdown(data, state);
  }
  
  if (tableKey === 'events' && column === 'type') {
    return buildEventTypeFilterDropdown(data, state);
  }
  
  if (tableKey === 'events' && column === 'creator') {
    return buildEventCreatorFilterDropdown(data, state);
  }
  
  const uniqueValues = new Set();
  data.forEach(item => {
    let value = '';
    
    switch(tableKey) {
      case 'types':
        if (column === 'name') value = item.o_adi || '';
        if (column === 'good') value = (item.good === true || item.good === 'true' || item.good === 1) ? t('beneficial') : t('notBeneficial');
        if (column === 'creator') value = item.created_by_name || '-';
        break;
      case 'users':
        if (column === 'username') value = item.username || '';
        if (column === 'role') value = item.role || '';
        if (column === 'email') value = item.email || '';
        if (column === 'verified') value = item.email_verified ? t('yes') : t('no');
        break;
      case 'events':
        if (column === 'type') value = item.olay_turu_adi || '-';
        if (column === 'creator') value = item.created_by_username || '-';
        if (column === 'photo') value = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? t('available') : t('notAvailable');
        if (column === 'video') value = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? t('available') : t('notAvailable');
        break;
    }
    
    if (value) uniqueValues.add(value);
  });
  
  const sortedValues = Array.from(uniqueValues).sort((a, b) => {
    if (column === 'date') {
      try {
        const dateA = new Date(a.split(' ')[0].split('.').reverse().join('-'));
        const dateB = new Date(b.split(' ')[0].split('.').reverse().join('-'));
        return dateB - dateA; 
      } catch {
        return String(a).localeCompare(String(b));
      }
    }
    return String(a).localeCompare(String(b));
  });
  
  const valueCounts = {};
  data.forEach(item => {
    let value = '';
    
    switch(tableKey) {
      case 'types':
        if (column === 'name') value = item.o_adi || '';
        if (column === 'good') value = (item.good === true || item.good === 'true' || item.good === 1) ? t('beneficial') : t('notBeneficial');
        if (column === 'creator') value = item.created_by_name || '-';
        break;
      case 'users':
        if (column === 'username') value = item.username || '';
        if (column === 'role') value = item.role || '';
        if (column === 'email') value = item.email || '';
        if (column === 'verified') value = item.email_verified ? t('yes') : t('no');
        break;
      case 'events':
        if (column === 'type') value = item.olay_turu_adi || '-';
        if (column === 'creator') value = item.created_by_username || '-';
        if (column === 'photo') value = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? t('available') : t('notAvailable');
        if (column === 'video') value = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? t('available') : t('notAvailable');
        break;
    }
    
    if (value) valueCounts[value] = (valueCounts[value] || 0) + 1;
  });
  
  let isAllSelected = false;
  
  if (!state.filters[column] || !Array.isArray(state.filters[column])) {
    isAllSelected = true;
  } else if (state.filters[column].length === 0) {
    isAllSelected = false;
  } else if (state.filters[column].length === sortedValues.length) {
    isAllSelected = true;
  } else {
    isAllSelected = false;
  }
  
  let html = `
    <input type="text" class="filter-search" placeholder="${t('search')}" />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${isAllSelected ? 'checked' : ''} />
        <span>(${t('selectAll')})</span>
      </label>
  `;

  sortedValues.forEach(value => {
    let filteredCount = 0;
    state.filtered.forEach(item => {
      let itemValue = '';
      
      switch(tableKey) {
        case 'types':
          if (column === 'name') itemValue = item.o_adi || '';
          if (column === 'good') itemValue = (item.good === true || item.good === 'true' || item.good === 1) ? t('beneficial') : t('notBeneficial');
          if (column === 'creator') itemValue = item.created_by_name || '-';
          break;
        case 'users':
          if (column === 'username') itemValue = item.username || '';
          if (column === 'role') itemValue = item.role || '';
          if (column === 'email') itemValue = item.email || '';
          if (column === 'verified') itemValue = item.email_verified ? t('yes') : t('no');
          break;
        case 'events':
          if (column === 'type') itemValue = item.olay_turu_adi || '-';
          if (column === 'creator') itemValue = item.created_by_username || '-';
          if (column === 'photo') itemValue = (Array.isArray(item.photo_urls) && item.photo_urls.length > 0) ? t('available') : t('notAvailable');
          if (column === 'video') itemValue = (Array.isArray(item.video_urls) && item.video_urls.length > 0) ? t('available') : t('notAvailable');
          break;
      }
      
      if (itemValue === value) filteredCount++;
    });
    
    let checked = false;
    if (!state.filters[column] || !Array.isArray(state.filters[column])) {
      checked = true;
    } else if (state.filters[column].length === 0) {
      checked = false;
    } else {
      checked = state.filters[column].includes(value);
    }
    
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(value)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(value)} (${filteredCount})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}

/* ==================== EVENT TYPE FILTER DROPDOWN (GOOD/BAD) ==================== */
function buildEventTypeFilterDropdown(data, state) {
  const typeMap = new Map();
  state.data.forEach(item => {
    const typeName = item.olay_turu_adi || '-';
    const typeId = item.olay_turu_id;
    const isGood = item.olay_turu_good === true || item.olay_turu_good === 'true' || item.olay_turu_good === 1;
    
    if (!typeMap.has(typeName)) {
      typeMap.set(typeName, { name: typeName, id: typeId, isGood: isGood, count: 0 });
    }
  });
  
  state.filtered.forEach(item => {
    const typeName = item.olay_turu_adi || '-';
    if (typeMap.has(typeName)) {
      typeMap.get(typeName).count++;
    }
  });
  
  let goodCount = 0;
  let badCount = 0;
  state.filtered.forEach(item => {
    const isGood = item.olay_turu_good === true || item.olay_turu_good === 'true' || item.olay_turu_good === 1;
    if (isGood) goodCount++;
    else badCount++;
  });
  
  const sortedTypes = Array.from(typeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  
  const specialFilters = state.specialFilters || {};
  
  const allTypesSelected = !state.filters.type || state.filters.type.length === sortedTypes.length;
  const allGoodBadSelected = specialFilters.typeGood !== false && specialFilters.typeBad !== false;
  const selectAllChecked = allTypesSelected && allGoodBadSelected;
  
  let html = `
    <input type="text" class="filter-search" placeholder="${t('search')}" />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${selectAllChecked ? 'checked' : ''} />
        <span>(${t('selectAll')})</span>
      </label>
      
      <hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />
      
      <label class="filter-option special-filter-item" style="background:#d4edda; border-radius:4px; padding:4px 8px;">
        <input type="checkbox" class="filter-event-type-good" ${specialFilters.typeGood !== false ? 'checked' : ''} />
        <span style="font-weight:500;">✅ ${t('beneficialToCitizen')} (${goodCount})</span>
      </label>
      
      <label class="filter-option special-filter-item" style="background:#f8d7da; border-radius:4px; padding:4px 8px;">
        <input type="checkbox" class="filter-event-type-bad" ${specialFilters.typeBad !== false ? 'checked' : ''} />
        <span style="font-weight:500;">❌ ${t('notBeneficialToCitizen')} (${badCount})</span>
      </label>
      
      <hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />
  `;
  
  sortedTypes.forEach(type => {
    const badge = type.isGood ? '✅' : '❌';
    
    let checked = false;
    if (state.filters.type && state.filters.type.length > 0) {
      checked = state.filters.type.includes(type.name);
    } else {
      if (specialFilters.typeGood === false && type.isGood) {
        checked = false;
      } else if (specialFilters.typeBad === false && !type.isGood) {
        checked = false;
      } else {
        checked = true;
      }
    }
    
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(type.name)}" ${checked ? 'checked' : ''} />
        <span>${badge} ${escapeHtml(type.name)} (${type.count})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}

/* ==================== EVENT CREATOR FILTER DROPDOWN (EMAIL DOMAINS) ==================== */
function buildEventCreatorFilterDropdown(data, state) {
  const uniqueCreators = new Set();
  state.data.forEach(item => {
    const creator = item.created_by_username || '-';
    if (creator) uniqueCreators.add(creator);
  });
  
  const sortedCreators = Array.from(uniqueCreators).sort();
  
  const creatorCounts = {};
  sortedCreators.forEach(creator => {
    creatorCounts[creator] = 0;
  });
  
  state.filtered.forEach(item => {
    const creator = item.created_by_username || '-';
    if (creator && creatorCounts.hasOwnProperty(creator)) {
      creatorCounts[creator]++;
    }
  });
  
  const activeDomains = new Set();
  
  if (tableStates.users && tableStates.users.data) {
    tableStates.users.data.forEach(user => {
      const email = user.email || '';
      const match = email.match(/@(.+)$/);
      if (match) {
        const domain = match[1];
        activeDomains.add(domain);
      }
    });
  }
  
  const domainCounts = {};
  activeDomains.forEach(domain => {
    domainCounts[domain] = 0;
  });
  
  if (tableStates.users && tableStates.users.data) {
    tableStates.users.data.forEach(user => {
      const email = user.email || '';
      const match = email.match(/@(.+)$/);
      if (match) {
        const domain = match[1];
        if (!activeDomains.has(domain)) return;
        
        const username = user.username;
        state.filtered.forEach(item => {
          if (item.created_by_username === username) {
            domainCounts[domain]++;
          }
        });
      }
    });
  }
  
  const sortedDomains = Array.from(activeDomains).sort();
  
  const specialFilters = state.specialFilters || {};
  const allCreatorsSelected = !state.filters.creator || state.filters.creator.length === sortedCreators.length;
  const allDomainsSelected = !specialFilters.creatorDomains || specialFilters.creatorDomains.length === sortedDomains.length;
  const selectAllChecked = allCreatorsSelected && allDomainsSelected;
  
  let html = `
    <input type="text" class="filter-search" placeholder="${t('search')}" />
    <div class="filter-options-container">
      <label class="filter-option">
        <input type="checkbox" class="filter-select-all" ${selectAllChecked ? 'checked' : ''} />
        <span>(${t('selectAll')})</span>
      </label>
  `;
  
  if (sortedDomains.length > 0) {
    html += `<div style="font-weight:600; font-size:0.85rem; color:var(--primary); margin:8px 0 4px 0;">📧 ${t('emailDomains')}:</div>`;
    
    sortedDomains.forEach(domain => {
      const count = domainCounts[domain] || 0;
      const checked = !specialFilters.creatorDomains || specialFilters.creatorDomains.includes(domain);
      html += `
        <label class="filter-option special-filter-item" style="background:#e3f2fd; border-radius:4px; padding:4px 8px; margin:2px 0;">
          <input type="checkbox" class="filter-creator-domain" data-domain="${escapeHtml(domain)}" ${checked ? 'checked' : ''} />
          <span style="font-weight:500;">@${escapeHtml(domain)} (${count})</span>
        </label>
      `;
    });
    
    html += '<hr style="margin:8px 0; border:none; border-top:1px solid var(--border);" />';
  }
  
  sortedCreators.forEach(creator => {
    const count = creatorCounts[creator] || 0;
    
    let checked = false;
    if (state.filters.creator && state.filters.creator.length > 0) {
      checked = state.filters.creator.includes(creator);
    } else if (specialFilters.creatorDomains && specialFilters.creatorDomains.length < sortedDomains.length) {
      if (tableStates.users && tableStates.users.data) {
        const user = tableStates.users.data.find(u => u.username === creator);
        if (user && user.email) {
          const match = user.email.match(/@(.+)$/);
          if (match) {
            checked = specialFilters.creatorDomains.includes(match[1]);
          }
        }
      }
    } else {
      checked = true;
    }
    
    html += `
      <label class="filter-option">
        <input type="checkbox" class="filter-checkbox" value="${escapeHtml(creator)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(creator)} (${count})</span>
      </label>
    `;
  });
  
  html += `</div>`;
  return html;
}

/* ==================== APPLY EVENT TYPE GOOD/BAD FILTERS ==================== */
function applyEventTypeGoodBadFilters(tableKey) {
  const state = tableStates[tableKey];
  const dropdown = document.querySelector(`#${tableKey}-table .filter-dropdown[data-column="type"]`);
  if (!dropdown) return;
  
  const goodChecked = dropdown.querySelector('.filter-event-type-good')?.checked;
  const badChecked = dropdown.querySelector('.filter-event-type-bad')?.checked;
  
  if (!state.specialFilters) state.specialFilters = {};
  state.specialFilters.typeGood = goodChecked;
  state.specialFilters.typeBad = badChecked;
  
  if (!goodChecked && !badChecked) {
    state.filtered = [];
    state.currentPage = 1;
    renderTable(tableKey);
    updateFilterIcon(tableKey, 'type');
    return;
  }
  
  const selectedTypes = state.filters.type || [];
  
  state.filtered = state.data.filter(item => {
    const typeName = item.olay_turu_adi || '-';
    const isGood = item.olay_turu_good === true || item.olay_turu_good === 'true' || item.olay_turu_good === 1;
    
    if (selectedTypes.length > 0 && !selectedTypes.includes(typeName)) {
      return false;
    }
    
    if (goodChecked && badChecked) return true;
    if (goodChecked && isGood) return true;
    if (badChecked && !isGood) return true;
    return false;
  });
  
  const selectAllBox = dropdown.querySelector('.filter-select-all');
  if (selectAllBox && goodChecked && badChecked) {
    const allCheckboxes = dropdown.querySelectorAll('.filter-checkbox');
    const checkedCheckboxes = dropdown.querySelectorAll('.filter-checkbox:checked');
    selectAllBox.checked = checkedCheckboxes.length === allCheckboxes.length;
    
    if (checkedCheckboxes.length === allCheckboxes.length) {
      delete state.filters.type;
    }
  }
  
  state.currentPage = 1;
  renderTable(tableKey);
  updateFilterIcon(tableKey, 'type');
}

/* ==================== APPLY EVENT CREATOR DOMAIN FILTERS ==================== */
function applyEventCreatorDomainFilters(tableKey) {
  const state = tableStates[tableKey];
  const dropdown = document.querySelector(`#${tableKey}-table .filter-dropdown[data-column="creator"]`);
  if (!dropdown) return;
  
  const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-creator-domain:checked'))
    .map(cb => cb.getAttribute('data-domain'));
  
  if (!state.specialFilters) state.specialFilters = {};
  state.specialFilters.creatorDomains = checkedDomains;
  
  const selectedCreators = state.filters.creator || [];
  
  const usernamesInDomains = [];
  if (tableStates.users && tableStates.users.data) {
    tableStates.users.data.forEach(user => {
      const email = user.email || '';
      const match = email.match(/@(.+)$/);
      if (match && checkedDomains.includes(match[1])) {
        usernamesInDomains.push(user.username);
      }
    });
  }
  
  state.filtered = state.data.filter(item => {
    const creator = item.created_by_username || '';
    
    const inDomain = usernamesInDomains.includes(creator);
    const inSelected = selectedCreators.length === 0 || selectedCreators.includes(creator);
    
    return inDomain || (selectedCreators.length > 0 && inSelected);
  });
  
  state.currentPage = 1;
  renderTable(tableKey);
  updateFilterIcon(tableKey, 'creator');
}

let globalClickHandlerAttached = false;

function attachGlobalClickHandler() {
  if (globalClickHandlerAttached) return;
  globalClickHandlerAttached = true;
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-icon') && !e.target.closest('.filter-dropdown')) {
      qsa('.filter-dropdown.show').forEach(d => d.classList.remove('show'));
    }
  });
}

function attachFilterEvents(tableKey) {
  const table = qs(`#${tableKey}-table`);
  if (!table) return;
  
  attachGlobalClickHandler();
  
  table.querySelectorAll('.filter-icon').forEach(icon => {
    const cloned = icon.cloneNode(true);
    icon.parentNode.replaceChild(cloned, icon);
  });
  table.querySelectorAll('.filter-icon').forEach(icon => {
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
    
    newIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      const column = newIcon.getAttribute('data-column');
      const dropdown = table.querySelector(`.filter-dropdown[data-column="${column}"]`);
      
      table.querySelectorAll('.filter-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
      });
      
      if (dropdown) {
        const isShown = dropdown.classList.toggle('show');
        
        if (isShown) {
          const rect = newIcon.getBoundingClientRect();
          dropdown.style.top = `${rect.bottom + 4}px`;
          dropdown.style.left = `${rect.left}px`;
          
          dropdown.innerHTML = buildFilterDropdown(tableKey, column, tableStates[tableKey].data);
          
          const state = tableStates[tableKey];
          const specialFilters = state.specialFilters || {};
          
          if (tableKey === 'events' && column === 'type') {
            const goodBox = dropdown.querySelector('.filter-event-type-good');
            const badBox = dropdown.querySelector('.filter-event-type-bad');
            if (goodBox && specialFilters.typeGood !== undefined) {
              goodBox.checked = specialFilters.typeGood;
            }
            if (badBox && specialFilters.typeBad !== undefined) {
              badBox.checked = specialFilters.typeBad;
            }
            
            const normalCheckboxes = dropdown.querySelectorAll('.filter-checkbox');
            const selectedTypes = state.filters.type || [];
            
            normalCheckboxes.forEach(cb => {
              const typeName = cb.value;
              
              if (selectedTypes.length > 0) {
                cb.checked = selectedTypes.includes(typeName);
              } else {
                const typeData = state.data.find(item => (item.olay_turu_adi || '-') === typeName);
                if (typeData) {
                  const isGood = typeData.olay_turu_good === true || typeData.olay_turu_good === 'true' || typeData.olay_turu_good === 1;
                  
                  if (specialFilters.typeGood === false && isGood) {
                    cb.checked = false;
                  } else if (specialFilters.typeBad === false && !isGood) {
                    cb.checked = false;
                  } else {
                    cb.checked = true;
                  }
                }
              }
            });
          }
          
          if (tableKey === 'events' && column === 'creator') {
            if (specialFilters.creatorDomains !== undefined) {
              dropdown.querySelectorAll('.filter-creator-domain').forEach(cb => {
                const domain = cb.getAttribute('data-domain');
                cb.checked = specialFilters.creatorDomains.includes(domain);
              });
              
              const usernamesInDomains = [];
              if (tableStates.users && tableStates.users.data) {
                tableStates.users.data.forEach(user => {
                  const email = user.email || '';
                  const match = email.match(/@(.+)$/);
                  if (match && specialFilters.creatorDomains.includes(match[1])) {
                    usernamesInDomains.push(user.username);
                  }
                });
              }
              
              dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
                const username = cb.value;
                if (usernamesInDomains.includes(username)) {
                  cb.checked = true;
                }
              });
            }
          }
          
          if (tableKey === 'users' && column === 'email') {
            if (specialFilters.emailDomains !== undefined) {
              dropdown.querySelectorAll('.filter-email-domain').forEach(cb => {
                const domain = cb.getAttribute('data-domain');
                cb.checked = specialFilters.emailDomains.includes(domain);
              });
              
              const manuallySelectedEmails = state.filters.email || [];
              
              dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
                const email = cb.value;
                const match = email.match(/@(.+)$/);
                
                const isManuallySelected = manuallySelectedEmails.includes(email);
                
                const inSelectedDomain = match && specialFilters.emailDomains.includes(match[1]);
                
                cb.checked = isManuallySelected || inSelectedDomain;
              });
            }
          }
          
          if (tableKey === 'events' && column === 'date') {
            const newestBox = dropdown.querySelector('.filter-sort-newest');
            const oldestBox = dropdown.querySelector('.filter-sort-oldest');
            if (specialFilters.sortOrder === 'newest' && newestBox) {
              newestBox.checked = true;
            } else if (specialFilters.sortOrder === 'oldest' && oldestBox) {
              oldestBox.checked = true;
            }
          }
          
          const searchInput = dropdown.querySelector('.filter-search');
          searchInput?.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (tableKey === 'events' && column === 'date') {
              updateCustomDateFilters(dropdown, searchTerm, tableStates[tableKey].data);
            }
            
            dropdown.querySelectorAll('.filter-option').forEach((opt, idx) => {
              if (idx === 0) return;
              
              if (tableKey === 'events' && column === 'date' && (idx === 1 || idx === 2)) return;
              
              const isDomainOption = opt.querySelector('.filter-email-domain');
              if (isDomainOption) {
                const domainText = opt.textContent.toLowerCase();
                opt.style.display = domainText.includes(searchTerm) ? 'flex' : 'none';
                return;
              }
              
              const isGoodBadOption = opt.querySelector('.filter-event-type-good') || opt.querySelector('.filter-event-type-bad');
              if (isGoodBadOption) {
                const optionText = opt.textContent.toLowerCase();
                opt.style.display = optionText.includes(searchTerm) ? 'flex' : 'none';
                return;
              }
              
              const isCreatorDomainOption = opt.querySelector('.filter-creator-domain');
              if (isCreatorDomainOption) {
                const domainText = opt.textContent.toLowerCase();
                opt.style.display = domainText.includes(searchTerm) ? 'flex' : 'none';
                return;
              }
              
              const checkbox = opt.querySelector('.filter-checkbox');
              const value = checkbox?.value || '';
              const text = opt.textContent.toLowerCase();
              
              let match = false;
              
              if (searchTerm) {
                if (tableKey === 'events' && column === 'date') {
                  match = matchDateQuery(value, searchTerm);
                } else {
                  const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
                  const valueText = value.toLowerCase();
                  const displayText = text;
                  
                  if (searchWords.length === 0) {
                    match = true;
                  } else {
                    match = searchWords.every(word => {
                      return valueText.includes(word) || displayText.includes(word);
                    });
                  }
                }
              } else {
                match = true;
              }
              
              opt.style.display = match ? 'flex' : 'none';
            });
          });
          
          const selectAllBox = dropdown.querySelector('.filter-select-all');
          selectAllBox?.addEventListener('change', (e) => {
            const checkboxes = dropdown.querySelectorAll('.filter-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            
            if (tableKey === 'users' && column === 'email') {
              dropdown.querySelectorAll('.filter-email-domain').forEach(cb => cb.checked = e.target.checked);
              
              if (!state.specialFilters) state.specialFilters = {};
              if (e.target.checked) {
                const allDomains = Array.from(dropdown.querySelectorAll('.filter-email-domain')).map(cb => cb.getAttribute('data-domain'));
                state.specialFilters.emailDomains = allDomains;
              } else {
                state.specialFilters.emailDomains = [];
              }
            }
            
            if (tableKey === 'events' && column === 'creator') {
              dropdown.querySelectorAll('.filter-creator-domain').forEach(cb => cb.checked = e.target.checked);
              
              if (!state.specialFilters) state.specialFilters = {};
              if (e.target.checked) {
                const allDomains = Array.from(dropdown.querySelectorAll('.filter-creator-domain')).map(cb => cb.getAttribute('data-domain'));
                state.specialFilters.creatorDomains = allDomains;
              } else {
                state.specialFilters.creatorDomains = [];
              }
            }
            
            if (tableKey === 'events' && column === 'type') {
              const goodBox = dropdown.querySelector('.filter-event-type-good');
              const badBox = dropdown.querySelector('.filter-event-type-bad');
              if (goodBox) goodBox.checked = e.target.checked;
              if (badBox) badBox.checked = e.target.checked;
              
              if (!state.specialFilters) state.specialFilters = {};
              state.specialFilters.typeGood = e.target.checked;
              state.specialFilters.typeBad = e.target.checked;
            }
            
            if (e.target.checked) {
              delete tableStates[tableKey].filters[column];
            } else {
              tableStates[tableKey].filters[column] = [];
            }
            applyFilters(tableKey);
            updateFilterIcon(tableKey, column);
          });
          
          if (tableKey === 'users' && column === 'email') {
            dropdown.querySelectorAll('.filter-email-domain').forEach(domainBox => {
              domainBox.addEventListener('change', () => {
                const allDomainBoxes = dropdown.querySelectorAll('.filter-email-domain');
                const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-email-domain:checked'))
                  .map(cb => cb.getAttribute('data-domain'));
                
                state.filters.email = [];
                
                dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
                  const email = cb.value;
                  const match = email.match(/@(.+)$/);
                  
                  if (match) {
                    const emailDomain = match[1];
                    
                    if (checkedDomains.includes(emailDomain)) {
                      cb.checked = true;
                    } else {
                      cb.checked = false;
                    }
                  }
                });
                
                applyEmailDomainFilters('users');
              });
            });
          }
          
          if (tableKey === 'events' && column === 'creator') {
            dropdown.querySelectorAll('.filter-creator-domain').forEach(domainBox => {
              domainBox.addEventListener('change', () => {
                const allDomainBoxes = dropdown.querySelectorAll('.filter-creator-domain');
                const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-creator-domain:checked'))
                  .map(cb => cb.getAttribute('data-domain'));
                
                const selectAllBox = dropdown.querySelector('.filter-select-all');
                if (selectAllBox) {
                  const allCheckboxes = dropdown.querySelectorAll('.filter-checkbox');
                  const checkedCheckboxes = dropdown.querySelectorAll('.filter-checkbox:checked');
                  selectAllBox.checked = checkedDomains.length === allDomainBoxes.length && checkedCheckboxes.length === allCheckboxes.length;
                }
                
                const usernamesInDomains = [];
                if (tableStates.users && tableStates.users.data) {
                  tableStates.users.data.forEach(user => {
                    const email = user.email || '';
                    const match = email.match(/@(.+)$/);
                    if (match && checkedDomains.includes(match[1])) {
                      usernamesInDomains.push(user.username);
                    }
                  });
                }
                
                dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
                  const username = cb.value;
                  
                  if (usernamesInDomains.includes(username)) {
                    if (!cb.checked) cb.checked = true;
                  } else if (checkedDomains.length > 0) {
                    if (!state.filters.creator || !state.filters.creator.includes(username)) {
                      cb.checked = false;
                    }
                  }
                });
                
                applyEventCreatorDomainFilters('events');
              });
            });
          }
          
          if (tableKey === 'events' && column === 'type') {
            const goodBox = dropdown.querySelector('.filter-event-type-good');
            const badBox = dropdown.querySelector('.filter-event-type-bad');
            const selectAllBox = dropdown.querySelector('.filter-select-all');
            
            const updateTypeCheckboxes = () => {
              const goodChecked = goodBox?.checked;
              const badChecked = badBox?.checked;
              
              const allCheckboxes = dropdown.querySelectorAll('.filter-checkbox');
              const selectedTypes = state.filters.type || [];
              
              dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
                const typeName = cb.value;
                const typeData = state.data.find(item => (item.olay_turu_adi || '-') === typeName);
                if (typeData) {
                  const isGood = typeData.olay_turu_good === true || typeData.olay_turu_good === 'true' || typeData.olay_turu_good === 1;
                  
                  if (selectedTypes.length > 0) {
                    if (goodChecked && badChecked) {
                      cb.checked = true;
                    } else if (goodChecked && isGood) {
                      cb.checked = true;
                    } else if (badChecked && !isGood) {
                      cb.checked = true;
                    } else if (!goodChecked && isGood) {
                      cb.checked = false;
                    } else if (!badChecked && !isGood) {
                      cb.checked = false;
                    }
                  } else {
                    if (goodChecked === false && isGood) {
                      cb.checked = false;
                    } else if (badChecked === false && !isGood) {
                      cb.checked = false;
                    } else if (goodChecked === true && badChecked === true) {
                      cb.checked = true;
                    } else if (goodChecked === true && isGood) {
                      cb.checked = true;
                    } else if (badChecked === true && !isGood) {
                      cb.checked = true;
                    }
                  }
                }
              });
              
              if (selectedTypes.length > 0) {
                state.filters.type = [];
              }
              
              if (selectAllBox) {
                const checkedCheckboxes = dropdown.querySelectorAll('.filter-checkbox:checked');
                selectAllBox.checked = goodChecked && badChecked && checkedCheckboxes.length === allCheckboxes.length;
              }
              
              applyEventTypeGoodBadFilters('events');
            };
            
            goodBox?.addEventListener('change', updateTypeCheckboxes);
            badBox?.addEventListener('change', updateTypeCheckboxes);
          }
          
          if (tableKey === 'events' && column === 'date') {
            const newestBox = dropdown.querySelector('.filter-sort-newest');
            const oldestBox = dropdown.querySelector('.filter-sort-oldest');
            
            newestBox?.addEventListener('change', (e) => {
              if (e.target.checked) {
                applySortFilter('newest');
              }
            });
            
            oldestBox?.addEventListener('change', (e) => {
              if (e.target.checked) {
                applySortFilter('oldest');
              }
            });
          }
          
          dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
              const checkedBoxes = Array.from(dropdown.querySelectorAll('.filter-checkbox:checked'));
              const allBoxes = dropdown.querySelectorAll('.filter-checkbox');
              
              const selectAllBox = dropdown.querySelector('.filter-select-all');
              
              if (checkedBoxes.length === 0) {
                tableStates[tableKey].filters[column] = [];
                if (selectAllBox) selectAllBox.checked = false;
              } else if (checkedBoxes.length === allBoxes.length) {
                delete tableStates[tableKey].filters[column];
                if (selectAllBox) selectAllBox.checked = true;
              } else {
                tableStates[tableKey].filters[column] = checkedBoxes.map(cb => cb.value);
                if (selectAllBox) selectAllBox.checked = false;
              }
              
              if (tableKey === 'events' && column === 'type') {
                const goodBox = dropdown.querySelector('.filter-event-type-good');
                const badBox = dropdown.querySelector('.filter-event-type-bad');
                
                let allGoodChecked = true;
                let allBadChecked = true;
                
                dropdown.querySelectorAll('.filter-checkbox').forEach(cb => {
                  const typeName = cb.value;
                  const typeData = state.data.find(item => (item.olay_turu_adi || '-') === typeName);
                  if (typeData) {
                    const isGood = typeData.olay_turu_good === true || typeData.olay_turu_good === 'true' || typeData.olay_turu_good === 1;
                    
                    if (isGood && !cb.checked) allGoodChecked = false;
                    if (!isGood && !cb.checked) allBadChecked = false;
                  }
                });
                
                if (goodBox) goodBox.checked = allGoodChecked;
                if (badBox) badBox.checked = allBadChecked;
                
                if (!state.specialFilters) state.specialFilters = {};
                state.specialFilters.typeGood = allGoodChecked;
                state.specialFilters.typeBad = allBadChecked;
              }
              
              if (tableKey === 'events' && column === 'creator') {
                const selectedUsernames = checkedBoxes.map(cb => cb.value);
                
                dropdown.querySelectorAll('.filter-creator-domain').forEach(domainCb => {
                  const domain = domainCb.getAttribute('data-domain');
                  
                  const usersInDomain = [];
                  if (tableStates.users && tableStates.users.data) {
                    tableStates.users.data.forEach(user => {
                      const email = user.email || '';
                      if (email.endsWith('@' + domain)) {
                        const hasEvents = state.data.some(item => item.created_by_username === user.username);
                        if (hasEvents) {
                          usersInDomain.push(user.username);
                        }
                      }
                    });
                  }
                  
                  const allUsersSelected = usersInDomain.length > 0 && usersInDomain.every(u => selectedUsernames.includes(u));
                  domainCb.checked = allUsersSelected;
                });
                
                if (!state.specialFilters) state.specialFilters = {};
                const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-creator-domain:checked'))
                  .map(cb => cb.getAttribute('data-domain'));
                state.specialFilters.creatorDomains = checkedDomains;
              }
              
              if (tableKey === 'users' && column === 'email') {
                const selectedEmails = checkedBoxes.map(cb => cb.value);
                
                const allDomains = new Set();
                state.data.forEach(item => {
                  const email = item.email || '';
                  const match = email.match(/@(.+)$/);
                  if (match) allDomains.add(match[1]);
                });
                
                dropdown.querySelectorAll('.filter-email-domain').forEach(domainCb => {
                  const domain = domainCb.getAttribute('data-domain');
                  
                  const emailsInDomain = [];
                  state.data.forEach(item => {
                    const email = item.email;
                    if (email && email.endsWith('@' + domain)) {
                      if (!emailsInDomain.includes(email)) {
                        emailsInDomain.push(email);
                      }
                    }
                  });
                  
                  const domainEmailsSelected = emailsInDomain.filter(e => selectedEmails.includes(e));
                  const allEmailsSelected = emailsInDomain.length > 0 && domainEmailsSelected.length === emailsInDomain.length;
                  
                  domainCb.checked = allEmailsSelected;
                });
                
                if (!state.specialFilters) state.specialFilters = {};
                const checkedDomains = Array.from(dropdown.querySelectorAll('.filter-email-domain:checked'))
                  .map(cb => cb.getAttribute('data-domain'));
                state.specialFilters.emailDomains = checkedDomains;
              }
              
              applyFilters(tableKey);
              updateFilterIcon(tableKey, column);
            });
          });
        }
      }
    });
  });
}

function updateFilterIcon(tableKey, column) {
  const table = qs(`#${tableKey}-table`);
  if (!table) return;
  
  const icon = table.querySelector(`.filter-icon[data-column="${column}"]`);
  if (!icon) return;
  
  const state = tableStates[tableKey];
  let hasFilter = false;
  
  if (state.filters[column]) {
    if (Array.isArray(state.filters[column])) {
      hasFilter = state.filters[column].length > 0;
    } else {
      hasFilter = true;
    }
  }
  if (!hasFilter && state.specialFilters) {
    if (tableKey === 'events') {
      if (column === 'type') {
        const typeGood = state.specialFilters.typeGood;
        const typeBad = state.specialFilters.typeBad;
        hasFilter = typeGood === false || typeBad === false;
      }
      
      if (column === 'creator' && state.specialFilters.creatorDomains) {
        const activeDomains = new Set();
        if (tableStates.users && tableStates.users.data) {
          tableStates.users.data.forEach(user => {
            const email = user.email || '';
            const match = email.match(/@(.+)$/);
            if (match) activeDomains.add(match[1]);
          });
        }
        
        hasFilter = state.specialFilters.creatorDomains.length < activeDomains.size;
      }
      
      if (column === 'date' && state.specialFilters.sortOrder) {
        hasFilter = true;
      }
    }
    
    if (tableKey === 'users' && column === 'email' && state.specialFilters.emailDomains) {
      const activeDomains = new Set();
      state.data.forEach(item => {
        const email = item.email || '';
        const match = email.match(/@(.+)$/);
        if (match) activeDomains.add(match[1]);
      });
      
      hasFilter = state.specialFilters.emailDomains.length < activeDomains.size;
    }
  }
  
  if (hasFilter) {
    icon.classList.add('active');
  } else {
    icon.classList.remove('active');
  }
}

function renderPagination(tableKey) {
  const state = tableStates[tableKey];
  const infoEl = qs(`#${tableKey}-pagination-info`);
  const controlsEl = qs(`#${tableKey}-pagination-controls`);
  
  if (!infoEl || !controlsEl) return;
  
  const total = state.filtered.length;
  const pageSize = state.pageSize || total;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  const currentPage = Math.min(state.currentPage, totalPages);

  const totalData = state.data.length;
  const totalFiltered = state.filtered.length;
  
  if (pageSize >= total) {
    if (totalFiltered < totalData) {
      infoEl.textContent = t('showingFilteredRecords', { filtered: totalFiltered, total: totalData });
    } else {
      infoEl.textContent = t('showingTotalRecords', { total });
    }
  } else {
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    if (totalFiltered < totalData) {
      infoEl.textContent = t('showingRangeFilteredRecords', { start, end, filtered: totalFiltered, total: totalData });
    } else {
      infoEl.textContent = t('showingRangeRecords', { start, end, total });
    }
  }

  if (totalPages <= 1) {
    controlsEl.innerHTML = '';
    return;
  }
  
  let html = '';

  html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="1">‹‹</button>`;
  html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
  
  const maxButtons = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${totalPages}">››</button>`;
  
  controlsEl.innerHTML = html;
  
  controlsEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.getAttribute('data-page'), 10);
      if (page >= 1 && page <= totalPages) {
        state.currentPage = page;
        renderTable(tableKey);
      }
    });
  });
}

/* ==================== SYNC EVENT MAP WITH FILTER ==================== */
function clearMarkersLayerSafe(){
  try { markersLayer?.clearLayers(); } catch {}
}

function addEventMarkerToLayer(e){
  const lat = parseFloat(e.enlem), lng = parseFloat(e.boylam);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const m = markerFor(e).addTo(markersLayer);

  const turHtml = e.olay_turu_adi ? `<b>${t('type')}:</b> ${escapeHtml(e.olay_turu_adi)}<br>` : '';
  const creatorName = e.created_by_username ?? '';
  const creatorId = (e.created_by_id != null) ? String(e.created_by_id) : '-';
  const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';

  const mediaHtml = `
    <div><b>${t('photo')}:</b></div>
    <div class="popup-photos"><div data-ph="${e.olay_id}"></div></div>
    <div style="height:6px"></div>
    <div><b>${t('video')}:</b></div>
    <div class="popup-videos"><div data-vd="${e.olay_id}"></div></div>
  `;

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="margin-bottom:6px;">
      <b>${t('eventID')}:</b> ${e.olay_id}
      <span class="badge ${e.is_mine ? 'mine' : 'other'}" style="margin-left:6px;">${e.is_mine ? t('mine') : t('other')}</span>
    </div>
    ${turHtml}
    <div class="popup-body"><b>${t('description')}:</b> ${e.aciklama ? escapeHtml(e.aciklama) : ''}</div>
    ${mediaHtml}
    ${currentUser ? `<div class="popup-meta"><b>${t('addedBy')}:</b> ${escapeHtml(who)}</div>` : ''}
    <div class="inline" style="gap:6px; margin-top:8px;"></div>
  `;

  const btnRow = content.querySelector('.inline');

  const canEdit = (currentUser && (currentUser.role === 'admin' || (currentUser.role === 'user' && e.is_mine)));
  if (canEdit) {
    const eb = document.createElement('button');
    eb.className = 'btn ghost'; 
    eb.textContent = t('update');
    eb.onclick = () => beginEdit(e);
    btnRow.appendChild(eb);
  }

  const canDelete = currentUser && (
    (currentUser.role === 'user' && e.is_mine) ||
    (currentUser.role === 'supervisor') ||
    (currentUser.role === 'admin')
  );
  if (canDelete) {
    const db = document.createElement('button');
    db.className = 'btn danger'; 
    db.textContent = t('delete');
    db.onclick = async () => {
      if (!confirm(t('confirmDeleteEvent'))) return;
      db.disabled = true;
      try {
        const url = (currentUser.role === 'user') ? `/api/olay/${e.olay_id}` : `/api/admin/olay/${e.olay_id}`;
        await fetch(url, {method:'DELETE'});
        await Promise.all([loadExistingEvents({ publicMode:false }), refreshAdminEvents()]);
      } catch(err) {
        console.error('delete event error:', err);
      } finally { db.disabled = false; }
    };
    btnRow.appendChild(db);
  }

  m.bindPopup(content);
  m.on('popupopen', () => populateEventMedia(content, e));
}

function syncMapWithFilteredEvents(){
  if (!map || !markersLayer) return;
  const eventsTabActive = qs('#events-tab')?.classList.contains('active');
  if (!eventsTabActive) return;

  clearMarkersLayerSafe();

  const list = tableStates?.events?.filtered || [];
  list.forEach(e => addEventMarkerToLayer(e));

  try { 
    map.invalidateSize();
    
    if (list.length > 0 && currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
      try {
        const group = L.featureGroup(markersLayer.getLayers());
        if (group.getLayers().length > 0) {
          map.fitBounds(group.getBounds().pad(0.15));
        }
      } catch {}
    }
  } catch {}
}

function renderTable(tableKey) {
  const state = tableStates[tableKey];
  
  const pageSize = state.pageSize || state.filtered.length;
  const start = (state.currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageData = state.filtered.slice(start, end);
  
  switch(tableKey) {
    case 'types':
      renderTypeTableRows(pageData);
      break;
    case 'users':
      renderUserTableRows(pageData);
      break;
    case 'events':
      renderEventTableRows(pageData);
      break;
  }
  
  renderPagination(tableKey);
  
  attachFilterEvents(tableKey);
  const table = qs(`#${tableKey}-table`);
  if (table) {
    table.querySelectorAll('.filter-icon').forEach(icon => {
      const column = icon.getAttribute('data-column');
      if (column) {
        updateFilterIcon(tableKey, column);
      }
    });
  }
  if (tableKey === 'events' && currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
    syncMapWithFilteredEvents();

    ensureEventsMap();
    ensureEventsExportControl();
    syncEventsMapWithFilteredEvents();
  }
}

function syncEventsMapWithFilteredEvents(){
  if (!eventsMap || !eventsMarkersLayer) return;
  
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) return;
  
  const list = tableStates?.events?.filtered || [];

  try { eventsMarkersLayer.clearLayers(); } catch {}
  list.forEach(e=>{
    const lat = parseFloat(e.enlem), lng = parseFloat(e.boylam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const m = L.marker([lat,lng], { icon: iconForEvent(e) }).addTo(eventsMarkersLayer);
    
    const turHtml = e.olay_turu_adi ? `<b>${t('type')}:</b> ${escapeHtml(e.olay_turu_adi)}<br>` : '';
    const creatorName = e.created_by_username ?? '';
    const creatorId = (e.created_by_id != null) ? String(e.created_by_id) : '-';
    const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';

    const mediaHtml = `
      <div><b>${t('photo')}:</b></div>
      <div class="popup-photos"><div data-ph="${e.olay_id}"></div></div>
      <div style="height:6px"></div>
      <div><b>${t('video')}:</b></div>
      <div class="popup-videos"><div data-vd="${e.olay_id}"></div></div>
    `;

    const content = document.createElement('div');
    content.innerHTML = `
      <div style="margin-bottom:6px;">
        <b>${t('eventID')}:</b> ${e.olay_id}
        <span class="badge ${e.is_mine ? 'mine' : 'other'}" style="margin-left:6px;">${e.is_mine ? t('mine') : t('other')}</span>
      </div>
      ${turHtml}
      <div class="popup-body"><b>${t('description')}:</b> ${e.aciklama ? escapeHtml(e.aciklama) : ''}</div>
      ${mediaHtml}
      <div class="popup-meta"><b>${t('addedBy')}:</b> ${escapeHtml(who)}</div>
      <div class="inline" style="gap:6px; margin-top:8px;"></div>
    `;

    const btnRow = content.querySelector('.inline');

    const canEdit = (currentUser && (currentUser.role === 'admin' || (currentUser.role === 'user' && e.is_mine)));
    if (canEdit) {
      const eb = document.createElement('button');
      eb.className = 'btn ghost'; 
      eb.textContent = t('update');
      eb.onclick = () => beginEdit(e);
      btnRow.appendChild(eb);
    }

    const canDelete = currentUser && (
      (currentUser.role === 'user' && e.is_mine) ||
      (currentUser.role === 'supervisor') ||
      (currentUser.role === 'admin')
    );
    if (canDelete) {
      const db = document.createElement('button');
      db.className = 'btn danger'; 
      db.textContent = t('delete');
      db.onclick = async () => {
        if (!confirm(t('confirmDeleteEvent'))) return;
        db.disabled = true;
        try {
          const url = (currentUser.role === 'user') ? `/api/olay/${e.olay_id}` : `/api/admin/olay/${e.olay_id}`;
          await fetch(url, {method:'DELETE'});
          await Promise.all([loadExistingEvents({ publicMode:false }), refreshAdminEvents()]);
        } catch(err) {
          console.error('delete event error:', err);
        } finally { db.disabled = false; }
      };
      btnRow.appendChild(db);
    }

    m.bindPopup(content);
    m.on('popupopen', () => populateEventMedia(content, e));
  });

  try{
    const group = L.featureGroup(eventsMarkersLayer.getLayers());
    if (group.getLayers().length) eventsMap.fitBounds(group.getBounds().pad(0.15));
    eventsMap.invalidateSize();
  }catch{}
}

/* ==================== TABLE RENDER FUNCTIONS ==================== */

// Event Types Table
function renderTypeTableRows(data) {
  const tb = qs('#type-tbody');
  if (!tb) return;
  
  tb.innerHTML = '';
  
  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);">${t('noRecordsFound')}</td></tr>`;
    return;
  }
  
  data.forEach(t => {
    const tr = document.createElement('tr');
    
    const canDelete = currentUser && (
      currentUser.role === 'admin' || 
      (currentUser.role === 'supervisor' && 
       (t.created_by_id === currentUser.id || t.created_by_name === currentUser.username))
    );
    
    const canUpdate = currentUser && (
      currentUser.role === 'admin' || 
      (currentUser.role === 'supervisor' && 
       (t.created_by_id === currentUser.id || t.created_by_name === currentUser.username))
    );
    
    const goodText = (t.good === true || t.good === 'true' || t.good === 1) ? window.t('beneficial') : window.t('notBeneficial');
    
    const updateBtn = canUpdate 
      ? `<button class="btn ghost" data-update-type="${t.o_id}" data-type-name="${escapeHtml(t.o_adi)}" data-type-good="${t.good === true || t.good === 'true' || t.good === 1 ? 'true' : 'false'}" style="margin-right:4px;">${window.t('update')}</button>`
      : `<button class="btn ghost" disabled title="${window.t('noPermission')}" style="margin-right:4px;">${window.t('update')}</button>`;
    
    const deleteBtn = canDelete 
      ? `<button class="btn danger" data-del-type="${t.o_id}">${window.t('delete')}</button>`
      : `<button class="btn danger" disabled title="${window.t('noPermission')}">${window.t('delete')}</button>`;
    
    tr.innerHTML = `
      <td>${escapeHtml(t.o_adi)}</td>
      <td>${goodText}</td>
      <td>${escapeHtml(t.created_by_name || '-')}</td>
      <td>${updateBtn}${deleteBtn}</td>
    `;
    tb.appendChild(tr);
  });
  
  qsa('[data-del-type]:not([disabled])').forEach(b => {
    b.onclick = async () => {
      if (!confirm(window.t('confirmDeleteType'))) return;
      b.disabled = true;
      try { 
        const resp = await fetch('/api/admin/olaylar/' + b.getAttribute('data-del-type'), {method:'DELETE'});
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          toast(window.t('deleteFailed') + ': ' + (data.message || data.error || resp.status), 'error');
        } else {
          toast(window.t('typeDeleted'), 'success');
        }
      } catch(e) {
        toast(window.t('deleteError') + ': ' + e.message, 'error');
      }
      await Promise.all([loadOlayTypes(), loadExistingEvents(), refreshAdminEvents()]);
      b.disabled = false;
    };
  });
  
  qsa('[data-update-type]:not([disabled])').forEach(b => {
    b.onclick = () => {
      const typeId = b.getAttribute('data-update-type');
      const currentName = b.getAttribute('data-type-name');
      const currentGood = b.getAttribute('data-type-good') === 'true';
      openUpdateTypeModal(typeId, currentName, currentGood);
    };
  });
}

/* ==================== EVENT TYPE UPDATE MODAL ==================== */
function openUpdateTypeModal(typeId, currentName, currentGood) {
  const modal = qs('#update-type-modal');
  const input = qs('#update-type-input');
  const goodRadioYes = qs('#update-type-good-yes');
  const goodRadioNo = qs('#update-type-good-no');
  const saveBtn = qs('#update-type-save-btn');
  const cancelBtn = qs('#update-type-cancel-btn');
  
  if (!modal || !input || !saveBtn || !cancelBtn) {
    console.error('Update modal elements not found');
    return;
  }
  
  input.value = currentName;
  const isGood = (currentGood === true || currentGood === 'true' || currentGood === 1);
  if (goodRadioYes) goodRadioYes.checked = isGood;
  if (goodRadioNo) goodRadioNo.checked = !isGood;
  showModal(modal);

  const newSaveBtn = saveBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  
  newSaveBtn.onclick = async () => {
    const newName = input.value.trim();
    const newGood = goodRadioYes ? goodRadioYes.checked : false;
    
    if (!newName) {
      toast(t('typeNameRequired'), 'error');
      return;
    }
    
    const goodChanged = (newGood !== (currentGood === true || currentGood === 'true' || currentGood === 1));
    
    if (newName === currentName && !goodChanged) {
      toast(t('noChanges'), 'error');
      closeModal(modal);
      return;
    }
    
    newSaveBtn.disabled = true;
    try {
      const resp = await fetch('/api/admin/olaylar/' + typeId, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({o_adi: newName, good: newGood})
      });
      const data = await resp.json().catch(() => ({}));
      
      if (!resp.ok) {
        toast(t('updateFailed') + ': ' + (data.message || data.error || resp.status), 'error');
      } else {
        toast(t('typeUpdated'), 'success');
        closeModal(modal);
      }
    } catch(e) {
      toast(t('updateError') + ': ' + e.message, 'error');
    } finally {
      newSaveBtn.disabled = false;
    }
    
    await Promise.all([loadOlayTypes(), loadExistingEvents(), refreshAdminEvents()]);
  };
  
  newCancelBtn.onclick = () => {
    closeModal(modal);
  };
}

// Users Table
function renderUserTableRows(data) {
  const tb = qs('#user-tbody');
  if (!tb) return;
  
  tb.innerHTML = '';
  
  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);">${t('noRecordsFound')}</td></tr>`;
    return;
  }
  
  data.forEach(u => {
    const tr = document.createElement('tr');
    
    let canDelete = false;
    if (currentUser) {
      if (currentUser.role === 'admin') {
        canDelete = true;
      } else if (currentUser.role === 'supervisor') {
        const isSelf = u.id === currentUser.id;
        canDelete = isSelf || u.role === 'user';
      }
    }
    
    const deleteBtn = canDelete
      ? `<button class="btn danger" data-del-user="${u.id}">${t('delete')}</button>`
      : `<button class="btn danger" disabled title="${t('noPermission')}">${t('delete')}</button>`;
    
    tr.innerHTML = `
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.email || '')}</td>
      <td>${u.email_verified ? t('yes') : t('no')}</td>
      <td>${deleteBtn}</td>
    `;
    tb.appendChild(tr);
  });
  
  qsa('[data-del-user]:not([disabled])').forEach(b => {
    b.onclick = async () => {
      const id = b.getAttribute('data-del-user');
      const isSelf = currentUser && String(currentUser.id) === String(id);
      const confirmMsg = isSelf ? t('confirmDeleteOwnAccount') : t('confirmDeleteUser');
      
      if (!confirm(confirmMsg)) return;
      b.disabled = true;
      try {
        const resp = await fetch('/api/admin/users/' + id, {method:'DELETE'});
        const data = await resp.json().catch(() => ({}));
        
        if (!resp.ok) {
          toast(t('deleteFailed') + ': ' + (data.message || data.error || resp.status), 'error');
        } else {
          toast(t('userDeleted'), 'success');
        }
        
        if (resp.headers.get('X-Logged-Out') === '1' || isSelf) {
          alert(t('accountDeactivatedRedirect'));
          await logout(); 
          location.reload(); 
          return;
        }
      } catch(e) {
        toast(t('deleteError') + ': ' + e.message, 'error');
      }
      await Promise.all([
        refreshAdminUsers(),
        loadExistingEvents(),
        refreshAdminEvents(),
        loadOlayTypes()
      ]);
      b.disabled = false;
    };
  });
}

// Events Table
function renderEventTableRows(data) {
  const tb = qs('#event-tbody');
  if (!tb) return;
  
  tb.innerHTML = '';
  
  const eventsTable = qs('#events-table');
  if (eventsTable && currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
    eventsTable.querySelectorAll('.table-export-btn').forEach(btn => btn.remove());
    
    const thead = eventsTable.querySelector('thead tr');
    if (thead) {
      const lastTh = thead.querySelector('th:last-child');
      if (lastTh) {
        if (!lastTh.querySelector('.table-export-btn')) {
          const exportBtn = document.createElement('button');
          exportBtn.className = 'btn ghost icon-btn table-export-btn';
          exportBtn.innerHTML = '<img src="/download.svg" alt="' + t('download') + '" width="18" height="18" />';
          exportBtn.title = t('downloadFilteredEventsGeoJSON');
          exportBtn.style.cssText = 'margin-left: 8px; vertical-align: middle;';
          exportBtn.onclick = downloadFilteredEventsAsGeoJSON;
          lastTh.appendChild(exportBtn);
        }
      }
    }
  }
  
  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);">${t('noRecordsFound')}</td></tr>`;
    return;
  }
  
  data.forEach(o => {
    const creatorName = o.created_by_username ?? '';
    const creatorId = (o.created_by_id != null) ? String(o.created_by_id) : '-';
    const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';
    
    const hasPhoto = Array.isArray(o.photo_urls) && o.photo_urls.length > 0 ? t('available') : t('notAvailable');
    const hasVideo = Array.isArray(o.video_urls) && o.video_urls.length > 0 ? t('available') : t('notAvailable');
    
    const rawDate = o.created_at || o.eklenme_tarihi || null;
    const dateStr = rawDate ? formatDate(rawDate) : '-';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.olay_turu_adi ? escapeHtml(o.olay_turu_adi) : '-'}</td>
      <td><div class="td-desc">${o.aciklama ? escapeHtml(o.aciklama) : ''}</div></td>
      <td>${escapeHtml(who)}</td>
      <td>${hasPhoto}</td>
      <td>${hasVideo}</td>
      <td>${dateStr}</td>
      <td><button class="btn danger" data-del-olay="${o.olay_id}">${t('delete')}</button></td>
    `;
    tb.appendChild(tr);
  });
  
  qsa('[data-del-olay]').forEach(b => {
    b.onclick = async () => {
      if (!confirm(t('confirmDeleteEvent'))) return;
      b.disabled = true;
      try {
        const id = b.getAttribute('data-del-olay');
        const url = (currentUser && currentUser.role === 'user') ? '/api/olay/' + id : '/api/admin/olay/' + id;
        const resp = await fetch(url, {method:'DELETE'});
        const data = await resp.json().catch(() => ({}));
        
        if (!resp.ok) {
          toast(t('deleteFailed') + ': ' + (data.message || data.error || resp.status), 'error');
        } else {
          toast(t('eventDeleted'), 'success');
        }
      } catch(e) {
        toast(t('deleteError') + ': ' + e.message, 'error');
      }
      await Promise.all([loadExistingEvents(), refreshAdminEvents()]);
      b.disabled = false;
    };
  });
}

/* ==================== DATA LOADING FUNCTIONS ==================== */

let __typePickerUIInited = false;

async function loadOlayTypes() {
  const sel = qs('#olay_turu');
  try {
    const r = await fetch('/api/olaylar');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = await r.json();

    if (sel) {
      sel.innerHTML = `<option value="">-- ${t('pleaseSelect')} --</option>`;
      list.forEach(o => {
        const opt = document.createElement('option');
        opt.value = String(o.o_id);
        opt.textContent = o.o_adi;
        sel.appendChild(opt);
      });

      sel.removeAttribute('size');
      sel.style.height = 'auto';
      sel.style.overflowY = 'visible';
      sel.style.display = 'block';
      sel.style.maxHeight = 'none';
    }
    tableStates.types.data = list;
    tableStates.types.filtered = [...list];
    tableStates.types.currentPage = 1;

    renderTable('types');
    return list;
  } catch (e) {
    setError(qs('#error-message'), t('eventTypesLoadFailed'));
    return [];
  }
}

function initTypePickerUI(){
  const sel = qs('#olay_turu');
  if (!sel) return;

  const wrap = sel.closest('.type-picker');
  if (wrap) {
    wrap.parentElement.insertBefore(sel, wrap);
    wrap.remove();
  }

  __typePickerUIInited = true;
}

async function refreshAdminUsers(){
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) {
    console.warn('refreshAdminUsers: Unauthorized call blocked');
    return;
  }
  
  try {
    const r = await fetch('/api/admin/users');
    if (!r.ok) {
      if (r.status === 403) {
        console.warn('refreshAdminUsers: 403 Forbidden - access denied');
        return;
      }
      throw 0;
    }
    const list = await r.json();
    
    const activeUsers = list.filter(u => u.is_active !== false);
    
    tableStates.users.data = activeUsers;
    tableStates.users.filtered = [...activeUsers];
    tableStates.users.currentPage = 1;
    
    renderTable('users');
  } catch(e) {
    console.error('refreshAdminUsers error:', e);
  }
}

async function refreshAdminEvents(){
  try {
    const r = await fetch('/api/olaylar_tum');
    if (!r.ok) throw 0;
    const list = await r.json();
    
    const activeEvents = list
      .filter(o => o.active !== false)
      .sort((a, b) => {
        const dateA = new Date(a.created_at || a.eklenme_tarihi || 0);
        const dateB = new Date(b.created_at || b.eklenme_tarihi || 0);
        return dateB - dateA; 
      });
    
    tableStates.events.data = activeEvents;
    tableStates.events.filtered = [...activeEvents];
    tableStates.events.currentPage = 1;
    
    renderTable('events');
  } catch(e) {
    console.error('refreshAdminEvents error:', e);
  }
}

/* ==================== TAB NAVIGATION ==================== */

function initTabs() {
  const tabBtns = qsa('.tab-btn');
  const tabContents = qsa('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = qs(`#${targetTab}`);
      if (targetContent) targetContent.classList.add('active');

      const mapEl = document.getElementById('map');
      if (mapEl) {
        if (targetTab === 'events-tab') {
          mapEl.classList.remove('hidden');
          try { fitMapHeight(); } catch {}
          try { if (typeof map !== 'undefined' && map) map.invalidateSize(); } catch {}
        } else {
          mapEl.classList.add('hidden');
        }
      }

      const tableKey = (targetTab || '').replace('-tab', '');
      try {
        if (tableKey && tableStates && tableStates[tableKey]) {
          renderTable(tableKey);
        }
      } catch {}
    });
  });
}

/* ==================== PAGE SIZE SETTINGS ==================== */

async function loadPageSizeSettings() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw 0;
    const cfg = await r.json();
    
    tableStates.events.pageSize = cfg.pageSizeEvents > 0 ? cfg.pageSizeEvents : null;
    tableStates.types.pageSize = cfg.pageSizeTypes > 0 ? cfg.pageSizeTypes : null;
    tableStates.users.pageSize = cfg.pageSizeUsers > 0 ? cfg.pageSizeUsers : null;
  } catch(e) {
    console.warn('Page size settings could not be loaded, using defaults');
    tableStates.events.pageSize = null;
    tableStates.types.pageSize = null;
    tableStates.users.pageSize = null;
  }
}

/* ==================== EVENT TYPE CREATION ==================== */
qs('#btn-add-type')?.addEventListener('click', async () => {
  const name = qs('#new-type-name')?.value.trim();
  const goodRadioYes = qs('#new-type-good-yes');
  const good = goodRadioYes ? goodRadioYes.checked : false;
  
  if (!name) { 
    toast(t('pleaseEnterTypeName'), 'error'); 
    return; 
  }
  
  const btn = qs('#btn-add-type');
  if (btn) btn.disabled = true;
  
  try {
    const r = await fetch('/api/admin/olaylar', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({o_adi: name, good: good})
    });
    const data = await r.json().catch(() => ({}));
    
    if (!r.ok) {
      const errorMsg = data.message || data.error || t('unknownError');
      
      if (r.status === 409 || errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('zaten')) {
        toast(t('duplicateTypeError'), 'error', 4000);
      } else {
        toast(t('typeAddFailed') + ': ' + errorMsg, 'error');
      }
      throw new Error(errorMsg);
    }
    
    const nt = qs('#new-type-name');
    if (nt) nt.value = '';
    
    const goodYes = qs('#new-type-good-yes');
    const goodNo = qs('#new-type-good-no');
    if (goodYes) goodYes.checked = true;
    if (goodNo) goodNo.checked = false;
    
    await loadOlayTypes();
    toast(t('newTypeAdded'), 'success');
  } catch(e) {
    console.error('Type add error:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
});

/* ==================== MAP AND EVENT MANAGEMENT ==================== */

function allowBlackMarker() {
  if (window.SUPERVISOR_NO_ADD) return false;
  return !!(currentUser && currentUser.role === 'user');
}

function updateClickMarkerFromInputs(){
  const latEl = qs('#lat'); 
  const lngEl = qs('#lng');
  if (!latEl || !lngEl) return;
  const lat = parseFloat(latEl.value);
  const lng = parseFloat(lngEl.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const ll = L.latLng(lat, lng);
  if (clickMarker) clickMarker.setLatLng(ll);
  else clickMarker = L.marker(ll, { icon: BLACK_PIN() }).addTo(map).bindPopup(t('selectedLocation'));
}

['#lat','#lng'].forEach(id => qs(id)?.addEventListener('input', updateClickMarkerFromInputs));

// DB media populate
async function populateEventMedia(container, evt){
  try {
    const photoBox = container.querySelector(`[data-ph="${evt.olay_id}"]`);
    const videoBox = container.querySelector(`[data-vd="${evt.olay_id}"]`);

    // Photos
    if (photoBox) {
      const arr = Array.isArray(evt.photo_urls) ? evt.photo_urls : [];
      if (arr.length) {
        const tiles = arr.map(u => {
          const src = normalizeUploadUrl(u);
          return `
            <a href="#" class="popup-photo-link" data-src="${src}" title="${t('photo')}">
              <img src="${src}" alt="${t('photo')}" loading="lazy" style="width:100%;height:100px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />
            </a>`;
        }).join('');
        photoBox.innerHTML = `<div class="grid grid-2" style="gap:6px">${tiles}</div>`;
        photoBox.querySelectorAll('.popup-photo-link').forEach(a => {
          a.addEventListener('click', (e) => { 
            e.preventDefault(); 
            openLightboxImage(a.dataset.src); 
          });
        });
      } else {
        photoBox.innerHTML = `<div class="muted">${t('noPhoto')}</div>`;
      }
    }

    // Videos
    if (videoBox) {
      const arr = Array.isArray(evt.video_urls) ? evt.video_urls : [];
      if (arr.length) {
        const tiles = arr.map(u => {
          const src = normalizeUploadUrl(u);
          return `
            <a href="#" class="popup-video-link" data-src="${src}" title="${t('video')}">
              <video src="${src}" muted style="width:100%;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border);"></video>
            </a>`;
        }).join('');
        videoBox.innerHTML = `<div class="grid grid-1" style="gap:6px">${tiles}</div>`;
        videoBox.querySelectorAll('.popup-video-link').forEach(a => {
          a.addEventListener('click', (e) => { 
            e.preventDefault(); 
            openLightboxVideo(a.dataset.src); 
          });
        });
      } else {
        videoBox.innerHTML = `<div class="muted">${t('noVideo')}</div>`;
      }
    }
  } catch(err) {
    console.error('populateEventMedia error:', err);
  }
}
function recreatePopupContent(evt, marker) {
  const turHtml = evt.olay_turu_adi ? `<b>${t('type')}:</b> ${escapeHtml(evt.olay_turu_adi)}<br>` : '';
  const creatorName = evt.created_by_username ?? '';
  const creatorId = (evt.created_by_id != null) ? String(evt.created_by_id) : '-';
  const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';

  const mediaHtml = `
    <div><b>${t('photo')}:</b></div>
    <div class="popup-photos"><div data-ph="${evt.olay_id}"></div></div>
    <div style="height:6px"></div>
    <div><b>${t('video')}:</b></div>
    <div class="popup-videos"><div data-vd="${evt.olay_id}"></div></div>
  `;

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="margin-bottom:6px;">
      <b>${t('eventID')}:</b> ${evt.olay_id}
      <span class="badge ${evt.is_mine ? 'mine' : 'other'}" style="margin-left:6px;">${evt.is_mine ? t('mine') : t('other')}</span>
    </div>
    ${turHtml}
    <div class="popup-body"><b>${t('description')}:</b> ${evt.aciklama ? escapeHtml(evt.aciklama) : ''}</div>
    ${mediaHtml}
    ${currentUser ? `<div class="popup-meta"><b>${t('addedBy')}:</b> ${escapeHtml(who)}</div>` : ''}
    <div class="inline" style="gap:6px; margin-top:8px;"></div>
  `;

  const btnRow = content.querySelector('.inline');

  const canEdit = (currentUser && (currentUser.role === 'admin' || (currentUser.role === 'user' && evt.is_mine)));
  if (canEdit) {
    const eb = document.createElement('button');
    eb.className = 'btn ghost'; 
    eb.textContent = t('update');
    eb.onclick = () => beginEdit(evt);
    btnRow.appendChild(eb);
  }

  const canDelete = currentUser && (
    (currentUser.role === 'user' && evt.is_mine) ||
    (currentUser.role === 'supervisor') ||
    (currentUser.role === 'admin')
  );
  if (canDelete) {
    const db = document.createElement('button');
    db.className = 'btn danger'; 
    db.textContent = t('delete');
    db.onclick = async () => {
      if (!confirm(t('confirmDeleteEvent'))) return;
      db.disabled = true;
      try {
        const url = (currentUser.role === 'user') ? `/api/olay/${evt.olay_id}` : `/api/admin/olay/${evt.olay_id}`;
        await fetch(url, {method:'DELETE'});
        await Promise.all([loadExistingEvents({ publicMode:false }), refreshAdminEvents()]);
      } catch(err) {
        console.error('delete event error:', err);
      } finally { db.disabled = false; }
    };
    btnRow.appendChild(db);
  }

  marker.setPopupContent(content);
  populateEventMedia(content, evt);
}

function normalizeUploadUrl(u){
  if (!u) return null;
  const s = String(u);
  return s.startsWith('/uploads/') ? s : `/uploads/${s.replace(/^uploads\//, '')}`;
}

async function loadExistingEvents(opts = {}) {
  const publicMode = !!opts.publicMode;
  
  if (publicMode) {
    const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
    const showBad = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);

    if (!showGood && !showBad) {
      eventIndex.clear();
      if (markersLayer) markersLayer.clearLayers();
      return;
    }
  }
  try {
    const resp = await fetch('/api/olaylar_tum');
    if (!resp.ok) throw 0;
    let events = await resp.json();

    if (publicMode) {
      const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
      const showBad = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);
      
      const beforeFilter = events.length;
      events = events.filter(evt => {
        const isGood = evt.olay_turu_good === true || 
                      evt.olay_turu_good === 'true' || 
                      evt.olay_turu_good === 1;
        
        if (showGood && showBad) return true; 
        if (showGood && isGood) return true;  
        if (showBad && !isGood) return true;  
        return false;
      });
    }

    eventIndex.clear();
    if (markersLayer) markersLayer.clearLayers();

    let addedMarkers = 0;
    events.forEach(evt => {
      const e2 = { ...evt };
      if (publicMode) {
        e2.is_mine = false;
        e2.created_by_username = null;
        e2.created_by_id = null;
      }
      eventIndex.set(e2.olay_id, e2);

      const lat = parseFloat(e2.enlem), lng = parseFloat(e2.boylam);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn('[loadExistingEvents] Invalid coordinates, event:', e2.olay_id);
        return;
      }

      const m = markerFor(e2);
      if (markersLayer) {
        m.addTo(markersLayer);
        addedMarkers++;
      }

      const turHtml = e2.olay_turu_adi ? `<b>${t('type')}:</b> ${escapeHtml(e2.olay_turu_adi)}<br>` : '';
      const creatorName = e2.created_by_username ?? '';
      const creatorId = (e2.created_by_id != null) ? String(e2.created_by_id) : '-';
      const who = creatorName ? `${creatorName} (ID: ${creatorId})` : '-';

      const mediaHtml = `
        <div><b>${t('photo')}:</b></div>
        <div class="popup-photos"><div data-ph="${e2.olay_id}"></div></div>
        <div style="height:6px"></div>
        <div><b>${t('video')}:</b></div>
        <div class="popup-videos"><div data-vd="${e2.olay_id}"></div></div>
      `;

      const content = document.createElement('div');
      content.innerHTML = `
        <div style="margin-bottom:6px;">
          <b>${t('eventID')}:</b> ${e2.olay_id}
          <span class="badge ${e2.is_mine ? 'mine' : 'other'}" style="margin-left:6px;">${e2.is_mine ? t('mine') : t('other')}</span>
        </div>
        ${turHtml}
        <div class="popup-body"><b>${t('description')}:</b> ${e2.aciklama ? escapeHtml(e2.aciklama) : ''}</div>
        ${mediaHtml}
        ${publicMode ? '' : `<div class="popup-meta"><b>${t('addedBy')}:</b> ${escapeHtml(who)}</div>`}
        <div class="inline" style="gap:6px; margin-top:8px;"></div>
      `;
      const btnRow = content.querySelector('.inline');

      const canEdit = !publicMode && (currentUser && (currentUser.role === 'admin' || (currentUser.role === 'user' && e2.is_mine)));
      if (canEdit) {
        const eb = document.createElement('button');
        eb.className = 'btn ghost'; 
        eb.textContent = t('update');
        eb.onclick = () => beginEdit(e2);
        btnRow.appendChild(eb);
      }

      const canDelete = !publicMode && currentUser && (
        (currentUser.role === 'user' && e2.is_mine) ||
        (currentUser.role === 'supervisor') ||
        (currentUser.role === 'admin')
      );
      if (canDelete) {
        const db = document.createElement('button');
        db.className = 'btn danger'; 
        db.textContent = t('delete');
        db.onclick = async () => {
          if (!confirm(t('confirmDeleteEvent'))) return;
          db.disabled = true;
          try {
            const url = (currentUser.role === 'user') ? `/api/olay/${e2.olay_id}` : `/api/admin/olay/${e2.olay_id}`;
            await fetch(url, {method:'DELETE'});
            await Promise.all([loadExistingEvents({ publicMode }), refreshAdminEvents()]);
          } catch(err) {
            console.error('delete event error:', err);
          } finally { db.disabled = false; }
        };
        btnRow.appendChild(db);
      }

      m.bindPopup(content);
      m.on('popupopen', () => {
      recreatePopupContent(e2, m);
      });
    });

    try { 
      if (map) ensureMapLegend(map); 
    } catch(e) {
      console.warn('[loadExistingEvents] Legend could not be updated:', e);
    }

  } catch(err) {
    console.error('loadExistingEvents error:', err);
  }
}

/* ==================== EVENT FORM ==================== */

function beginEdit(evt){
  editingEventId = evt.olay_id;
  const sel = qs('#olay_turu');
  const ac  = qs('#aciklama');
  const lat = qs('#lat');
  const lng = qs('#lng');

  if (sel) sel.value = evt.olay_turu_id ? String(evt.olay_turu_id) : '';
  if (ac)  ac.value  = evt.aciklama || '';
  if (lat) lat.value = String(Number(evt.enlem));
  if (lng) lng.value = String(Number(evt.boylam));

  photoUrls = Array.isArray(evt.photo_urls) ? evt.photo_urls.map(normalizeUploadUrl) : [];
  videoUrls = Array.isArray(evt.video_urls) ? evt.video_urls.map(normalizeUploadUrl) : [];

  renderMediaLists();
  updateClickMarkerFromInputs();

  const eid = qs('#edit-id');
  if (eid) eid.textContent = '#' + evt.olay_id;
  show(qs('#edit-hint'));
  show(qs('#cancel-edit-btn'));

  const submitBtn = qs('#submit-btn');
  if (submitBtn) {
    submitBtn.textContent = t('update');
    submitBtn.classList.add('updating');
  }

  if (currentUser && currentUser.role === 'user') {
    const olayCard = qs('#olay-card');
    if (olayCard) {
      show(olayCard);
      ensureBackButton();

      pushOverlayState('olay-card');

      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.classList.add('blur-background');
    }
  }

  qs('#olay-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetEdit(){
  editingEventId = null;
  hide(qs('#edit-hint')); 
  hide(qs('#cancel-edit-btn')); 
  const eid = qs('#edit-id'); 
  if (eid) eid.textContent = '';
  const ac = qs('#aciklama'); 
  const lat = qs('#lat'); 
  const lng = qs('#lng'); 
  const sel = qs('#olay_turu');
  if (ac) ac.value = ''; 
  if (lat) lat.value = ''; 
  if (lng) lng.value = '';
  if (sel) {
    if (!editingEventId && lastSelectedEventType) {
      sel.value = lastSelectedEventType;
    } else {
      sel.value = '';
      lastSelectedEventType = '';
    }
  }
  photoUrls = []; 
  videoUrls = []; 
  renderMediaLists();
  if (clickMarker){ 
    map.removeLayer(clickMarker); 
    clickMarker = null; 
  }
  stopLiveLocation();
  
  const submitBtn = qs('#submit-btn');
  if (submitBtn) {
    submitBtn.textContent = t('submit');
    submitBtn.classList.remove('updating');
  }
}

async function submitOlay(){
  const errEl = qs('#error-message'); 
  clearError(errEl);
  const sel = qs('#olay_turu'); 
  if (sel && sel.value) {
    lastSelectedEventType = sel.value;
  }
  const ac = qs('#aciklama'); 
  const lat = qs('#lat'); 
  const lng = qs('#lng');
  const payload = {
    olay_turu: sel && sel.value ? parseInt(sel.value, 10) : null,
    aciklama : ac ? ac.value.trim() : '',
    enlem    : lat ? parseFloat(lat.value) : NaN,
    boylam   : lng ? parseFloat(lng.value) : NaN,
    photo_urls: Array.isArray(photoUrls) ? photoUrls : (photoUrls ? [photoUrls] : []),
    video_urls: Array.isArray(videoUrls) ? videoUrls : (videoUrls ? [videoUrls] : []),
  };

  if (!Number.isFinite(payload.enlem) || !Number.isFinite(payload.boylam)) 
    return setError(errEl, t('pleaseEnterLocation'));
  if (!payload.olay_turu) 
    return setError(errEl, t('pleaseSelectEventType'));

  const btn = qs('#submit-btn'); 
  if (btn) btn.disabled = true;
  
  const wasEditing = !!editingEventId;
  const editedEventId = editingEventId;
  
  try {
    let r, d;
    if (wasEditing) {
      r = await fetch(`/api/olay/${editedEventId}`, { 
        method:'PATCH', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(payload) 
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || r.status);
      toast(t('eventUpdated', {id: editedEventId}), 'success');
    } else {
      r = await fetch('/api/submit_olay', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(payload) 
      });
      d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || r.status);
      toast(t('eventAdded', {id: d.olay_id}), 'success');
    }
    
    photoUrls = []; 
    videoUrls = [];
    renderMediaLists();

    stopLiveLocation();
    resetEdit();
    
    await loadExistingEvents({ publicMode: false });
    
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
      await refreshAdminEvents();
    }
    
    if (currentUser && currentUser.role === 'user') {
      const olayCard = qs('#olay-card');
      if (olayCard) hide(olayCard);
      
      const mapEl = document.getElementById('map');
      if (mapEl) {
        mapEl.classList.remove('blur-background');
      }
      
      document.querySelectorAll('.header-back-btn, .card-back-btn').forEach(btn => btn.remove());
      
      if (wasEditing) {
        setTimeout(() => {
          try {
            markersLayer.eachLayer(marker => {
              const evt = eventIndex.get(editedEventId);
              if (evt) {
                const markerLatLng = marker.getLatLng();
                const evtLat = parseFloat(evt.enlem);
                const evtLng = parseFloat(evt.boylam);
                
                if (Math.abs(markerLatLng.lat - evtLat) < 0.0001 && 
                    Math.abs(markerLatLng.lng - evtLng) < 0.0001) {
                  marker.openPopup();
                  map.setView([evtLat, evtLng], map.getZoom(), { animate: true });
                }
              }
            });
          } catch(e) {
            console.warn('Popup could not be opened:', e);
          }
        }, 500);
      }
    }
  } catch(e) { 
    setError(errEl, t('operationError') + ': ' + e.message); 
  } finally { 
    if (btn) btn.disabled = false; 
  }
}

qs('#submit-btn')?.addEventListener('click', submitOlay);
qs('#cancel-edit-btn')?.addEventListener('click', resetEdit);

/* ==================== LOCATION MANAGEMENT ==================== */

function setLocateUI(running){
  const btnUse = qs('#btn-use-location');
  const btnStop = qs('#btn-stop-live');
  if (btnUse){
    if (running) {
      btnUse.innerHTML = `<img src="/dontuseposition.svg" alt="${t('cancel')}" width="20" height="20" style="opacity:0.6" />`;
      btnUse.classList.add('danger');
      btnUse.title = t('cancelLocation');
    } else {
      btnUse.innerHTML = `<img src="/useposition.svg" alt="${t('location')}" width="20" height="20" />`;
      btnUse.classList.remove('danger');
      btnUse.title = t('useMyLocation');
    }
  }
  if (btnStop){ 
    btnStop.style.display = running ? '' : 'none'; 
  }
}

function geoFindMeToggle(){
  if (liveWatchId !== null){ 
    stopLiveLocation(); 
    return; 
  }
  geoFindMeStart();
}

function geoFindMeStart() {
  if (!("geolocation" in navigator)) return;
  setLocateUI(true);
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      if (clickMarker) { try { map.removeLayer(clickMarker); } catch {} ; clickMarker = null; }

      const latEl = qs('#lat'); 
      const lngEl = qs('#lng');
      if (latEl) latEl.value = String(latitude);
      if (lngEl) lngEl.value = String(longitude);

      const ll = L.latLng(latitude, longitude);
      if (liveMarker) liveMarker.setLatLng(ll);
      else liveMarker = L.marker(ll, { icon: BLACK_PIN() }).addTo(map).bindPopup(t('myLocation'));

      map.setView(ll, Math.max(map.getZoom(), 17), { animate:true });
      startLiveLocation();
    },
    () => { setLocateUI(false); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
}

function startLiveLocation(){
  if (!("geolocation" in navigator)) return;
  if (liveWatchId !== null) return;
  liveWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      if (clickMarker) { try { map.removeLayer(clickMarker); } catch {} ; clickMarker = null; }

      const latEl = qs('#lat'); 
      const lngEl = qs('#lng');
      if (latEl) latEl.value = String(latitude);
      if (lngEl) lngEl.value = String(longitude);

      const ll = L.latLng(latitude, longitude);
      if (liveMarker) liveMarker.setLatLng(ll);
      else liveMarker = L.marker(ll, {icon: BLACK_PIN()}).addTo(map).bindPopup(t('myLocation'));

      if (Number.isFinite(accuracy)) {
        if (liveAccuracyCircle) liveAccuracyCircle.setLatLng(ll).setRadius(accuracy);
        else liveAccuracyCircle = L.circle(ll, {
          radius: accuracy, color:'#3b82f6', weight:1, opacity:.6, fillColor:'#3b82f6', fillOpacity:.18
        }).addTo(map);
      }
    },
    () => { stopLiveLocation(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
  setLocateUI(true);
}

function stopLiveLocation(){
  if (liveWatchId !== null) {
    try { navigator.geolocation.clearWatch(liveWatchId); } catch {}
    liveWatchId = null;
  }
  if (liveMarker) { 
    try { map.removeLayer(liveMarker); } catch {} 
    liveMarker = null; 
  }
  if (liveAccuracyCircle) { 
    try { map.removeLayer(liveAccuracyCircle); } catch {} 
    liveAccuracyCircle = null; 
  }
  setLocateUI(false);
}

qs('#btn-use-location')?.addEventListener('click', geoFindMeToggle);
qs('#btn-stop-live')?.addEventListener('click', stopLiveLocation);

/* ==================== MEDIA UPLOAD ==================== */

function renderMediaLists(){
  const ph = qs('#photo-list'); 
  const vd = qs('#video-list');

  const mediaWrapper = document.createElement('div');
  mediaWrapper.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px;';

  const photoCol = document.createElement('div');
  if (photoUrls.length) {
    const hasScroll = photoUrls.length > 2;
    const containerStyle = hasScroll 
      ? 'max-height: 240px; overflow-y: auto; padding-right: 4px;' 
      : '';
    
    photoCol.innerHTML = `
      <div class="media-scroll-container" style="${containerStyle}">
        <div class="media-grid-vertical">
          ${photoUrls.map((u, idx) => (
            `<div class="media-thumb-wrapper" style="position:relative;">
              <a href="${u}" class="media-thumb" title="${t('photo')} ${idx+1}" data-open-full="img" data-in-form="true" style="display:block; position:relative;">
                <img src="${u}" alt="${t('photo')}" loading="lazy" style="width:100%; height:120px; object-fit:cover; display:block; border-radius:6px;" />
              </a>
              <button class="media-remove-btn" data-remove-photo="${idx}" type="button" title="${t('deletePhoto')}" style="position:absolute; top:4px; right:4px; z-index:10;">×</button>
            </div>`
          )).join('')}
        </div>
      </div>`;
  } else {
    photoCol.innerHTML = `<div class="muted">${t('noPhoto')}</div>`;
  }

  const videoCol = document.createElement('div');
  if (videoUrls.length) {
    const hasScroll = videoUrls.length > 2;
    const containerStyle = hasScroll 
      ? 'max-height: 240px; overflow-y: auto; padding-right: 4px;' 
      : '';
    
    videoCol.innerHTML = `
      <div class="media-scroll-container" style="${containerStyle}">
        <div class="media-grid-vertical">
          ${videoUrls.map((u, idx) => (
            `<div class="media-thumb-wrapper" style="position:relative;">
              <a href="${u}" class="media-thumb" title="${t('video')} ${idx+1}" data-open-full="video" data-in-form="true" style="display:block; position:relative;">
                <video src="${u}" muted style="width:100%; height:120px; object-fit:cover; display:block; border-radius:6px;"></video>
              </a>
              <button class="media-remove-btn" data-remove-video="${idx}" type="button" title="${t('deleteVideo')}" style="position:absolute; top:4px; right:4px; z-index:10;">×</button>
            </div>`
          )).join('')}
        </div>
      </div>`;
  } else {
    videoCol.innerHTML = `<div class="muted">${t('noVideo')}</div>`;
  }

  mediaWrapper.appendChild(photoCol);
  mediaWrapper.appendChild(videoCol);

  if (ph) {
    ph.innerHTML = '';
    ph.appendChild(mediaWrapper.cloneNode(true));
  }
  if (vd) {
    vd.style.display = 'none'; 
  }

  qsa('#photo-list a[data-open-full="img"][data-in-form="true"]').forEach(a => {
    a.addEventListener('click', (e) => { 
      e.preventDefault();
      e.stopPropagation();
      openLightboxImageInForm(a.getAttribute('href')); 
    });
  });
  qsa('#video-list a[data-open-full="video"][data-in-form="true"]').forEach(a => {
    a.addEventListener('click', (e) => { 
      e.preventDefault();
      e.stopPropagation();
      openLightboxVideoInForm(a.getAttribute('href')); 
    });
  });

  qsa('[data-remove-photo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-photo'), 10);
      if (confirm(t('confirmRemovePhoto'))) {
        photoUrls.splice(idx, 1);
        renderMediaLists();
        toast(t('photoRemoved'), 'success');
      }
    });
  });

  qsa('[data-remove-video]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-video'), 10);
      if (confirm(t('confirmRemoveVideo'))) {
        videoUrls.splice(idx, 1);
        renderMediaLists();
        toast(t('videoRemoved'), 'success');
      }
    });
  });
}

function readAsDataURL(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(t('readError')));
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

async function uploadDataUrl(endpoint, dataUrl){
  const r = await fetch(endpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dataUrl })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || d.message || r.status);
  const url = (typeof d.url === 'string' && d.url) ? d.url
            : (Array.isArray(d.urls) && d.urls[0]) ? d.urls[0]
            : null;
  if (!url) throw new Error(t('invalidResponse'));
  return normalizeUploadUrl(url);
}

async function handleSelectPhoto(file){
  try {
    const dataUrl = await readAsDataURL(file);
    const url = await uploadDataUrl('/api/upload/photo', dataUrl);
    photoUrls = Array.from(new Set([...(photoUrls || []), url]));
    renderMediaLists();
  } catch(e) { 
    alert(t('photoUploadFailed') + ': ' + e.message); 
  }
}

async function handleSelectVideo(file){
  try {
    const dataUrl = await readAsDataURL(file);
    const url = await uploadDataUrl('/api/upload/video', dataUrl);
    videoUrls = Array.from(new Set([...(videoUrls || []), url]));
    renderMediaLists();
  } catch(e) { 
    alert(t('videoUploadFailed') + ': ' + e.message); 
  }
}

qs('#btn-add-photo')?.addEventListener('click', openPhotoModal);
qs('#btn-add-video')?.addEventListener('click', openVideoModal);
qs('#file-photo')?.addEventListener('change', e => {
  const f = e.target.files?.[0]; 
  if (f) handleSelectPhoto(f); 
  e.target.value = '';
});
qs('#file-video')?.addEventListener('change', e => {
  const f = e.target.files?.[0]; 
  if (f) handleSelectVideo(f); 
  e.target.value = '';
});

/* --------- PHOTO CAMERA MODAL --------- */
function stopPmStream(){
  try { pmStream?.getTracks().forEach(t => t.stop()); } catch {}
  pmStream = null;
}

async function openPhotoModal(){
  const modal = qs('#photo-modal'); 
  const v = qs('#pm-video'); 
  const c = qs('#pm-canvas');
  const captureBtn = qs('#pm-capture'); 
  const useBtn = qs('#pm-use'); 
  const retakeBtn = qs('#pm-retake');
  const galleryBtn = qs('#pm-gallery'); 
  const closeBtn = qs('#pm-close');
  
  if (modal) {
    modal.style.zIndex = '11000';
  }
  
  showModal(modal);

  try {
    pmStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (v) { 
      v.srcObject = pmStream; 
      v.muted = true; 
      v.playsInline = true; 
      v.play?.(); 
    }
  } catch {
    alert(t('cameraPermissionDenied'));
  }

  function resetShot(){
    hide(c); 
    show(v);
    hide(useBtn); 
    hide(retakeBtn); 
    show(captureBtn);
  }
  resetShot();

  if (captureBtn) captureBtn.onclick = () => {
    if (!pmStream){ 
      alert(t('cameraNotOpened')); 
      return; 
    }
    const trackSettings = pmStream.getVideoTracks()[0]?.getSettings?.() || {};
    const w = trackSettings.width || (v?.videoWidth) || 1280;
    const h = trackSettings.height || (v?.videoHeight) || 720;
    if (!c) return;
    c.width = w; 
    c.height = h;
    const ctx = c.getContext('2d');
    if (v) ctx.drawImage(v, 0, 0, w, h);
    hide(v); 
    show(c);
    hide(captureBtn); 
    show(useBtn); 
    show(retakeBtn);
  };

  if (retakeBtn) retakeBtn.onclick = resetShot;

  if (useBtn) useBtn.onclick = async () => {
    try {
      if (!c) return;
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      const url = await uploadDataUrl('/api/upload/photo', dataUrl);
      photoUrls = Array.from(new Set([...(photoUrls || []), url]));
      renderMediaLists();
      closeModal(modal, stopPmStream);
    } catch(e) { 
      alert(t('uploadError') + ': ' + e.message); 
    }
  };
  if (galleryBtn) galleryBtn.onclick = () => qs('#file-photo')?.click();
  if (closeBtn) closeBtn.onclick = () => {
    closeModal(modal, stopPmStream);
    if (modal) modal.style.zIndex = '';
  };
}

/* --------- VIDEO CAMERA MODAL --------- */
function stopVm(){
  try { vmRecorder?.stop(); } catch {}
  try { vmStream?.getTracks().forEach(t => t.stop()); } catch {}
  vmStream = null; 
  vmRecorder = null; 
  vmChunks = []; 
  vmRecording = false;
}

function pickBestMime(){
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4'
  ];
  if (!('MediaRecorder' in window)) return null;
  for (const t of candidates){
    try { 
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; 
    } catch {}
  }
  return undefined;
}

async function openVideoModal(){
  const modal = qs('#video-modal'); 
  const pv = qs('#vm-preview');
  const startBtn = qs('#vm-start'); 
  const stopBtn = qs('#vm-stop'); 
  const galleryBtn = qs('#vm-gallery');
  const closeBtn = qs('#vm-close');
  
  if (modal) {
    modal.style.zIndex = '11000';
  }
  
  showModal(modal);

  if (startBtn) show(startBtn);
  if (stopBtn)  hide(stopBtn);

  if (!('MediaRecorder' in window)){
    alert(t('videoRecordingNotSupported'));
    closeModal(modal, stopVm);
    qs('#file-video')?.click();
    return;
  }

  try {
    vmStream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'environment'}, audio:true });
    if (pv){ 
      pv.srcObject = vmStream; 
      pv.muted = true; 
      pv.playsInline = true; 
      pv.play?.(); 
    }
  } catch {
    alert(t('cameraPermissionDenied'));
    closeModal(modal, stopVm);
    qs('#file-video')?.click();
    return;
  }

  if (startBtn) startBtn.onclick = () => {
    if (!vmStream){ 
      alert(t('cameraNotOpened')); 
      return; 
    }
    vmChunks = [];
    const mime = pickBestMime();
    try {
      vmRecorder = new MediaRecorder(vmStream, mime ? { mimeType: mime } : undefined);
    } catch(e) {
      alert(t('recordingStartFailed') + ': ' + e.message);
      return;
    }
    vmRecorder.ondataavailable = e => { 
      if (e.data && e.data.size) vmChunks.push(e.data); 
    };
    vmRecorder.onerror = (e) => { 
      console.error('Recorder error', e); 
      toast(t('videoRecordingError'), 'error'); 
    };
    vmRecorder.onstop = async () => {
      try {
        if (!vmChunks.length){ 
          toast(t('recordingNotCreated'), 'error'); 
          show(startBtn); 
          hide(stopBtn); 
          return; 
        }
        const blob = new Blob(vmChunks, { type: vmRecorder.mimeType || 'video/webm' });
        const dataUrl = await blobToDataUrl(blob);
        const url = await uploadDataUrl('/api/upload/video', dataUrl);
        videoUrls = Array.from(new Set([...(videoUrls || []), url]));
        renderMediaLists();
        closeModal(modal, stopVm);
        toast(t('videoAdded'), 'success');
      } catch(e) { 
        alert(t('videoUploadError') + ': ' + e.message); 
      }
    };
    vmRecorder.start(250);
    vmRecording = true;
    hide(startBtn); 
    show(stopBtn);
  };

  if (stopBtn) stopBtn.onclick = () => {
    try {
      if (vmRecorder && vmRecording){
        vmRecorder.requestData?.();
        vmRecorder.stop();
        vmRecording = false;
      }
    } catch {}
    hide(stopBtn);
  };

  if (galleryBtn) galleryBtn.onclick = () => qs('#file-video')?.click();

  if (closeBtn) closeBtn.onclick = () => {
    closeModal(modal, stopVm);
    if (modal) modal.style.zIndex = '';
  };
}

function showModal(m){ 
  if (!m) return; 
  m.classList.add('show'); 
  m.setAttribute('aria-hidden', 'false');
  
  document.body.style.overflow = 'hidden';
}

function closeModal(m, cleanup){
  try { cleanup?.(); } catch {}
  if (!m) return;
  m.classList.remove('show'); 
  m.setAttribute('aria-hidden', 'true');
  
  document.body.style.overflow = '';
}

function blobToDataUrl(blob){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(t('readError')));
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

/* ==================== AUTH ==================== */

function pushOverlayState(name){
  try {
    history.pushState({ overlay: name }, '', location.href);
  } catch (e) {
  }
}

function restoreMapViewFromOverlay(){
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.classList.remove('blur-background');
  }

  hide(qs('#login-card'));
  hide(qs('#register-card'));
  hide(qs('#forgot-card'));
  hide(qs('#olay-card'));

  if (typeof resetEdit === 'function') {
    try { 
      resetEdit(); 
    } catch(e) {
      console.warn('resetEdit error:', e);
    }
  }

  document.querySelectorAll('.header-back-btn, .card-back-btn').forEach(btn => btn.remove());
  
  try {
    stopLiveLocation();
  } catch(e) {
    console.warn('stopLiveLocation error:', e);
  }
  
  if (!currentUser) {
    const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
    const showBad = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);
    if (showGood || showBad) {
      try {
        loadExistingEvents({ publicMode: true });
      } catch(e) {
        console.warn('Public events load error:', e);
      }
    }
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function anyOverlayVisible(){
  const cards = ['#login-card', '#register-card', '#forgot-card', '#olay-card'];
  return cards.some(sel => {
    const el = qs(sel);
    return el && !el.classList.contains('hidden');
  });
}


function goDefaultScreen(){
  if (currentUser){
    hide(qs('#login-card')); 
    hide(qs('#register-card')); 
    hide(qs('#forgot-card'));
    show(qs('#olay-card'));
  } else {
    hide(qs('#login-card'));
    hide(qs('#register-card')); 
    hide(qs('#forgot-card')); 
    hide(qs('#olay-card'));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function goToDefaultLoginScreen(){
  hide(qs('#login-card'));
  hide(qs('#register-card')); 
  hide(qs('#forgot-card')); 
  hide(qs('#olay-card')); 
  hide(qs('#admin-card'));

  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.classList.remove('blur-background');
  
  document.querySelectorAll('.header-back-btn, .card-back-btn').forEach(btn => btn.remove());
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetLoginForm(){
  const u = qs('#login-user'); 
  const p = qs('#login-pass'); 
  const t = qs('#login-totp');
  if (u) u.value = ''; 
  if (p) p.value = ''; 
  if (t) t.value = '';
  hide(qs('#totp-block')); 
  clearError(qs('#login-error'));
}

function resetRegisterForm(){
  const f = {
    u: qs('#reg-username'),
    e: qs('#reg-email'),
    p: qs('#reg-pass'),
    n: qs('#reg-name'),
    s: qs('#reg-surname'),
  };
  if (f.u) f.u.value = ''; 
  if (f.e) f.e.value = ''; 
  if (f.p) f.p.value = '';
  if (f.n) f.n.value = ''; 
  if (f.s) f.s.value = '';
  clearError(qs('#register-error'));
}

function resetForgotForm(){
  const e = qs('#fg-email'); 
  const c = qs('#fg-code');
  const p1 = qs('#fg-pass1'); 
  const p2 = qs('#fg-pass2');
  if (e) e.value = ''; 
  if (c) c.value = '';
  if (p1) p1.value = ''; 
  if (p2) p2.value = '';
  clearError(qs('#forgot-error'));
}

function showForgotStep(step){
  const emailRow = qs('#fg-email-row') || qs('#fg-email')?.closest('.row') || qs('#fg-email')?.parentElement;
  const codeRow  = qs('#fg-code-row')  || qs('#fg-code')?.closest('.row')  || qs('#fg-code')?.parentElement;

  const btnStart  = qs('#btn-forgot-start');
  const btnVerify = qs('#btn-forgot-verify');
  const btnReset  = qs('#btn-forgot-reset');

  if (emailRow) show(emailRow);
  if (codeRow)  (step >= 2 ? show(codeRow) : hide(codeRow));

  const pass1 = qs('#fg-pass1')?.closest('.row') || qs('#fg-pass1')?.parentElement;
  const pass2 = qs('#fg-pass2')?.closest('.row') || qs('#fg-pass2')?.parentElement;
  if (pass1) (step === 3 ? show(pass1) : hide(pass1));
  if (pass2) (step === 3 ? show(pass2) : hide(pass2));

  if (btnStart)  (step === 1 ? show(btnStart)  : hide(btnStart));
  if (btnVerify) (step === 2 ? show(btnVerify) : hide(btnVerify));
  if (btnReset)  (step === 3 ? show(btnReset)  : hide(btnReset));

  show(qs('#forgot-card')); 
  hide(qs('#login-card')); 
  hide(qs('#register-card')); 
  hide(qs('#olay-card'));
}

function reflectAuth(){
  const who = qs('#whoami'), rolePill = qs('#role-pill');
  const body = document.body;
  const adminCard = qs('#admin-card');
  const olayCard  = qs('#olay-card');

  body.classList.remove('role-admin', 'role-supervisor', 'role-user');
  if (currentUser){
    body.classList.add(`role-${currentUser.role}`);
  }

  const headerLocBtn = qs('#btn-use-location');
  if (headerLocBtn) {
    const shouldShow = currentUser && currentUser.role === 'user';
    headerLocBtn.style.display = shouldShow ? 'inline-flex' : 'none';
  }

  if (currentUser){
    if (who) { 
      who.textContent = t('greeting', { username: currentUser.username, role: currentUser.role }); 
      show(who); 
    }
    hide(qs('#btn-open-login')); 
    show(qs('#btn-logout'));
    hide(qs('#login-card')); 
    hide(qs('#register-card')); 
    hide(qs('#forgot-card')); 
    if (currentUser.role === 'user') {
      hide(olayCard);
    } else {
      show(olayCard);
    }
    if (rolePill) rolePill.textContent = String(currentUser.role).toUpperCase();

    if (currentUser.role === 'admin') {
      show(adminCard);
      qs('#sup-panel-toggle')?.remove();
      body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
    } else if (currentUser.role === 'supervisor') {
      ensureSupervisorToggle();
      const saved = (localStorage.getItem(SUP_MODE_KEY) || 'admin');
      setSupervisorMode(saved === 'form' ? 'form' : 'admin');
    } else {
      hide(adminCard);
      qs('#sup-panel-toggle')?.remove();
      body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
      window.SUPERVISOR_NO_ADD = false;
      window.FORCE_BLUE_MARKERS = false;
      try { attachMapClickForLoggedIn(); } catch {}
      try { ensureMapLegend(map); } catch {}
    }
  } else {
    who && (who.textContent = '');
    hide(who);
    show(qs('#btn-open-login')); 
    hide(qs('#btn-logout'));
    show(qs('#login-card')); 
    hide(qs('#register-card')); 
    hide(qs('#forgot-card')); 
    hide(qs('#olay-card')); 
    hide(adminCard);
    qs('#sup-panel-toggle')?.remove();
    body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin');
  }

  try { ensureMapLegend(map); } catch (e) {}
}

const SUP_MODE_KEY = 'sup_mode';

function setSupervisorMode(mode) {
  const body = document.body;
  const adminCard = qs('#admin-card');
  const olayCard = qs('#olay-card');

  body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin', 'supervisor-readonly-map');
  body.classList.add(mode === 'form' ? 'supervisor-mode-form' : 'supervisor-mode-admin');
  const submit = qs('#submit-btn');
  if (submit) {
    submit.disabled = true;
    submit.title = t('supervisorCannotAdd');
  }

  try { map?.off('click'); } catch (e) {}
  if (clickMarker) {
    try { map.removeLayer(clickMarker); } catch (e) {}
    clickMarker = null;
  }
  try { stopLiveLocation(); } catch (e) {}

  window.SUPERVISOR_NO_ADD = true;
  window.FORCE_BLUE_MARKERS = true;

  function removeGpkgIfAny() {
    try {
      const bars = document.querySelectorAll('.leaflet-top.leaflet-right .leaflet-bar');
      bars.forEach((el) => {
        if (el && el.textContent && el.textContent.trim() === 'GPKG') el.remove();
      });
      __gpkgCtrlAdded = false;
    } catch (e) {}
  }

  if (mode === 'form') {
    hide(olayCard);
    hide(adminCard);

    removeGpkgIfAny();
    try { removeDownloadIfAny(); } catch (e) {}

    try { loadExistingEvents({ publicMode: false }); } catch (e) {}

    body.classList.add('supervisor-readonly-map');
    
    setTimeout(() => {
      try { 
        if (map) {
          map.invalidateSize();
          const lat = Number(APP_CONFIG.mapInitialLat);
          const lng = Number(APP_CONFIG.mapInitialLng);
          const zoom = Number(APP_CONFIG.mapInitialZoom);
          map.setView([lat, lng], zoom, { animate: false });
          
          ensureMapLegend(map);
        }
      } catch(e) { console.warn('Map resize error:', e); }
    }, 300);

    const eventsTabBtn = document.querySelector('.tab-btn[data-tab="events-tab"]');
    if (eventsTabBtn && !eventsTabBtn.classList.contains('active')) {
      eventsTabBtn.click(); 
    } else {
      const mapEl = document.getElementById('map');
      if (mapEl) {
        mapEl.classList.remove('hidden');
        try { fitMapHeight(); } catch (e) {}
        try { map.invalidateSize(); } catch (e) {}
      }
    }

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  } else {
    show(adminCard);
    show(olayCard);
    
    setTimeout(() => {
      try {
        ensureEventsMap(); 
        ensureEventsExportControl(); 
        syncEventsMapWithFilteredEvents(); 
      } catch(e) {
        console.warn('[setSupervisorMode] Map update error:', e);
      }
    }, 100);
    
    setTimeout(() => {
      try { 
        if (map) {
          map.invalidateSize();
          
          const hasMarkers = markersLayer && markersLayer.getLayers && markersLayer.getLayers().length > 0;
          if (hasMarkers) {
            try {
              const group = L.featureGroup(markersLayer.getLayers());
              if (group.getLayers().length > 0) {
                map.fitBounds(group.getBounds().pad(0.15));
              }
            } catch {}
          } else {
            const lat = Number(APP_CONFIG.mapInitialLat);
            const lng = Number(APP_CONFIG.mapInitialLng);
            const zoom = Number(APP_CONFIG.mapInitialZoom);
            map.setView([lat, lng], zoom, { animate: false });
          }
          
          ensureMapLegend(map);
        }
      } catch(e) { console.warn('Map resize error:', e); }
    }, 300);

    try { loadExistingEvents({ publicMode: false }); } catch (e) {}

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  try { 
    ensureMapLegend(map); 
  } catch(e) {
    console.warn('[setSupervisorMode] Legend update error:', e);
  }

  try { localStorage.setItem(SUP_MODE_KEY, mode); } catch (e) {}
  qs('#sup-btn-form')?.setAttribute('aria-pressed', String(mode === 'form'));
  qs('#sup-btn-admin')?.setAttribute('aria-pressed', String(mode !== 'form'));
}

function ensureSupervisorToggle(){
  if (qs('#sup-panel-toggle')) return;
  const host = qs('.auth') || qs('header .wrap') || document.body;
  const box = document.createElement('div');
  box.id = 'sup-panel-toggle';
  box.style.display = 'flex';
  box.style.gap = '6px';
  box.style.alignItems = 'center';
  box.innerHTML = `
    <button id="sup-btn-form" class="btn ghost" type="button" title="${t('eventView')}">${t('view')}</button>
    <button id="sup-btn-admin" class="btn ghost" type="button" title="${t('managementPanel')}">${t('management')}</button>
  `;
  host.appendChild(box);
  const saved = (localStorage.getItem(SUP_MODE_KEY) || 'admin');
  setSupervisorMode(saved === 'form' ? 'form' : 'admin');
  qs('#sup-btn-form')?.addEventListener('click', () => setSupervisorMode('form'));
  qs('#sup-btn-admin')?.addEventListener('click', () => setSupervisorMode('admin'));
}

async function checkMe(){
  try {
    const r = await fetch('/api/me');
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        saveToken(null);
      }
      throw 0;
    }
    currentUser = (await r.json()).me;
  } catch { 
    currentUser = null;
    if (authToken) {
      saveToken(null);
    }
  }
  
  if (!currentUser || currentUser.role === 'user') {
    window.SUPERVISOR_NO_ADD = false;
    window.FORCE_BLUE_MARKERS = false;
  }
  
  reflectAuth();
  if (currentUser){ 
    await Promise.all([
      loadPageSizeSettings(),
      loadOlayTypes(), 
      loadExistingEvents(), 
      refreshAdminUsers(), 
      refreshAdminEvents()
    ]); 
    
    try { ensureMapLegend(map); } catch {}
  } else { 
    markersLayer.clearLayers(); 
    
    try { ensureMapLegend(map); } catch {}
  }
}

async function login(){
  clearError(qs('#login-error'));
  const usernameOrEmail = qs('#login-user')?.value.trim();
  const password = qs('#login-pass')?.value;
  const totp = (qs('#login-totp')?.value.trim() || undefined);
  if (!usernameOrEmail || !password) return setError(qs('#login-error'), t('usernamePasswordRequired'));

  const btn = qs('#btn-login'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password, totp })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      if (data.error === 'totp_gerekli') {
        show(qs('#totp-block'));
        setError(qs('#login-error'), t('pleaseEnterVerificationCode'));
      } else {
        setError(qs('#login-error'), data.message || data.error || t('loginFailed'));
      }
      return;
    }

    if (data.token) saveToken(data.token);
    
    window.SUPERVISOR_NO_ADD = false;
    window.FORCE_BLUE_MARKERS = false;
    
    await checkMe();
    resetLoginForm();
    attachMapClickForLoggedIn();

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.classList.remove('blur-background');
    
    toast(t('loginSuccessful'), 'success');
  } catch(e) {
    setError(qs('#login-error'), t('loginError') + ': ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function register(){
  clearError(qs('#register-error'));
  const username = qs('#reg-username')?.value.trim();
  const email = qs('#reg-email')?.value.trim();
  const password = qs('#reg-pass')?.value;
  const name = qs('#reg-name')?.value.trim() || undefined;
  const surname = qs('#reg-surname')?.value.trim() || undefined;

  if (!username || !email || !password) 
    return setError(qs('#register-error'), t('usernameEmailPasswordRequired'));
  if (!isStrongPassword(password)) 
    return setError(qs('#register-error'), t('weakPassword'));

  const btn = qs('#btn-register'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, name, surname })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#register-error'), data.message || data.error || t('registrationFailed'));
      return;
    }

    alert(t('registrationSuccessfulCheckEmail'));
    resetRegisterForm();
    hide(qs('#register-card')); 
    show(qs('#login-card'));
  } catch(e) {
    setError(qs('#register-error'), t('registrationError') + ': ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function logout(){
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  saveToken(null);
  currentUser = null;
  
  window.SUPERVISOR_NO_ADD = false;
  window.FORCE_BLUE_MARKERS = false;
  
  document.body.classList.remove('supervisor-mode-form', 'supervisor-mode-admin', 'supervisor-readonly-map');
  qs('#sup-panel-toggle')?.remove();
  
  const submitBtn = qs('#submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.title = '';
  }
  
  reflectAuth();
  try { markersLayer.clearLayers(); } catch {}
  resetEdit();
  detachMapClickForLoggedOut();
  
  const currentLang = window.getLanguage();
  
  goDefaultScreen();
  
  const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
  const showBad = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);
  const showAny = showGood || showBad;
  
  if (showAny) {
    try {
      await loadExistingEvents({ publicMode: true });
      ensureMapLegend(map);
    } catch(e){
      console.warn('logout->public event load failed:', e);
    }
  } else {
    try { markersLayer?.clearLayers(); } catch {}
    ensureMapLegend(map);
  }

  removeDownloadIfAny();
  __eventsExportCtrlAdded = false;
  
  try {
    if (map) {
      const lat = Number(APP_CONFIG.mapInitialLat);
      const lng = Number(APP_CONFIG.mapInitialLng);
      const zoom = Number(APP_CONFIG.mapInitialZoom);
      map.setView([lat, lng], zoom, { animate: false });
      map.invalidateSize();
    }
  } catch(e) {
    console.warn('Map could not be reloaded:', e);
  }
}

function ensureAuthBackButton(cardSelector){
  const card = qs(cardSelector);
  if (!card) return;

  card.querySelectorAll('.card-back-btn').forEach(btn => btn.remove());

  const header = document.querySelector('header');
  if (!header) return;

  const existingBtn = header.querySelector('.header-back-btn');
  if (existingBtn) existingBtn.remove();

  const headerBackBtn = document.createElement('button');
  headerBackBtn.className = 'btn primary icon-btn header-back-btn';
  headerBackBtn.innerHTML = '<img src="/back.svg" alt="' + t('back') + '" width="20" height="20" loading="lazy" />';
  headerBackBtn.title = t('back');
  headerBackBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    restoreMapViewFromOverlay();
    
    try {
      if (window.history.state && window.history.state.overlay) {
        window.history.back();
      }
    } catch(e) {
      console.warn('History back error:', e);
    }
  };

  const wrap = header.querySelector('.wrap') || header;
  wrap.insertBefore(headerBackBtn, wrap.firstChild);
}

function ensureBackButton(){
  const olayCard = qs('#olay-card');
  if (!olayCard) return;
  
  document.querySelectorAll('.header-back-btn, .card-back-btn').forEach(btn => btn.remove());
  
  const formTitle = olayCard.querySelector('h2');
  if (!formTitle) return;
  
  let titleWrapper = formTitle.parentElement;
  
  if (!titleWrapper || titleWrapper === olayCard || !titleWrapper.classList.contains('title-wrapper')) {
    titleWrapper = document.createElement('div');
    titleWrapper.className = 'title-wrapper';
    titleWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;';
    formTitle.parentElement.insertBefore(titleWrapper, formTitle);
    titleWrapper.appendChild(formTitle);
  }
  
  if (titleWrapper.querySelector('.card-back-btn')) return;
  
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn primary icon-btn card-back-btn';
  backBtn.innerHTML = '<img src="/back.svg" alt="' + t('back') + '" width="20" height="20" loading="lazy" />';
  backBtn.title = t('back');
  backBtn.style.cssText = 'flex-shrink: 0;';
  backBtn.onclick = () => {
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.classList.remove('blur-background');
    }
    
    hide(olayCard);
    
    resetEdit();
    
    document.querySelectorAll('.header-back-btn, .card-back-btn').forEach(btn => btn.remove());
  
    try { 
      history.back(); 
    } catch(e) {
      console.warn('[BACK BTN] history.back() error:', e);
    }
  };
  
  titleWrapper.insertBefore(backBtn, formTitle);
}

qs('#goto-forgot')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetLoginForm();
  resetForgotForm();
  showForgotStep(1);
  
  ensureAuthBackButton('#forgot-card');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

qs('#toggle-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetRegisterForm();
  hide(qs('#register-card')); 
  hide(qs('#forgot-card')); 
  show(qs('#login-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

qs('#back-to-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetForgotForm();
  hide(qs('#forgot-card')); 
  show(qs('#login-card'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ==================== PASSWORD RESET STEPS ==================== */

qs('#btn-forgot-start')?.addEventListener('click', async () => {
  clearError(qs('#forgot-error'));
  const email = qs('#fg-email')?.value.trim();
  if (!email) return setError(qs('#forgot-error'), t('emailRequired'));

  const btn = qs('#btn-forgot-start'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/forgot/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#forgot-error'), data.message || data.error || t('codeNotSent'));
      return;
    }

    toast(t('verificationCodeSent'), 'success');
    showForgotStep(2);
  } catch(e) {
    setError(qs('#forgot-error'), t('error') + ': ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

qs('#btn-forgot-verify')?.addEventListener('click', async () => {
  clearError(qs('#forgot-error'));
  const email = qs('#fg-email')?.value.trim();
  const code = qs('#fg-code')?.value.trim();
  if (!email || !code) return setError(qs('#forgot-error'), t('emailCodeRequired'));

  const btn = qs('#btn-forgot-verify'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/forgot/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#forgot-error'), data.message || data.error || t('codeNotVerified'));
      return;
    }

    toast(t('codeVerifiedEnterNewPassword'), 'success');
    showForgotStep(3);
  } catch(e) {
    setError(qs('#forgot-error'), t('error') + ': ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

qs('#btn-forgot-reset')?.addEventListener('click', async () => {
  clearError(qs('#forgot-error'));
  const email = qs('#fg-email')?.value.trim();
  const code = qs('#fg-code')?.value.trim();
  const newPw = qs('#fg-pass1')?.value;
  const newPw2 = qs('#fg-pass2')?.value;

  if (!email || !code || !newPw || !newPw2) 
    return setError(qs('#forgot-error'), t('fillAllFields'));
  if (newPw !== newPw2) 
    return setError(qs('#forgot-error'), t('passwordsDoNotMatch'));
  if (!isStrongPassword(newPw)) 
    return setError(qs('#forgot-error'), t('weakPassword'));

  const btn = qs('#btn-forgot-reset'); 
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/auth/forgot/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, new_password: newPw, new_password_confirm: newPw2 })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      setError(qs('#forgot-error'), data.message || data.error || t('passwordNotReset'));
      return;
    }

    alert(t('passwordResetSuccessCanLogin'));
    resetForgotForm();
    hide(qs('#forgot-card')); 
    show(qs('#login-card'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(e) {
    setError(qs('#forgot-error'), t('error') + ': ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

qs('#toggle-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  resetLoginForm();
  hide(qs('#login-card')); 
  hide(qs('#forgot-card')); 
  show(qs('#register-card'));
  
  ensureAuthBackButton('#register-card');
  
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.classList.add('blur-background');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function setupSpeechToText() {
  const ac = qs('#aciklama');
  if (!ac) return;

  qsa('#btn-stt, .media-mic, .mic-inline').forEach(el => el.remove());

  const aciklamaLabel = Array.from(document.querySelectorAll('label')).find(l => 
    l.getAttribute('for') === 'aciklama'
  );
  if (!aciklamaLabel) return;

  const labelText = aciklamaLabel.childNodes[0];
  
  const mic = document.createElement('button');
  mic.id = 'btn-stt';
  mic.type = 'button';
  mic.className = 'btn ghost icon-btn stt-btn';
  mic.title = t('voiceToText');
  mic.setAttribute('aria-label', t('voiceToText'));
  mic.innerHTML = `<img src="/mic.svg" alt="${t('microphone')}" width="20" height="20" loading="lazy" />`;
  mic.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
    vertical-align: middle;
    min-width: 36px;
    min-height: 36px;
  `;
  
  aciklamaLabel.appendChild(mic);

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mic.disabled = true;
    mic.title = t('browserNoSpeechRecognition');
    return;
  }

  const rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.continuous = true;
  let listening = false;
  let lastFinal = '';
  let lastInterim = '';

  function setMicOn(){
    mic.classList.add('danger','listening','mic-blink');
    mic.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
      </svg>`;
  }
  function setMicOff(){
    mic.classList.remove('danger','listening','mic-blink');
    mic.innerHTML = `<img src="/mic.svg" alt="${t('microphone')}" width="20" height="20" loading="lazy" />`;
  }

  rec.onresult = (e) => {
    let interimText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        const txt = res[0].transcript.trim();
        if (txt && txt !== lastFinal) {
          const cur = ac.value.trim();
          const sep = cur ? ' ' : '';
          ac.value = cur + sep + txt;
          lastFinal = txt;
          lastInterim = '';
        }
      } else {
        interimText += res[0].transcript;
      }
    }
    lastInterim = interimText.trim();
  };

  rec.onend = () => {
    if (listening) {
      try { rec.start(); } catch {}
    } else {
      setMicOff();
    }
  };

  rec.onerror = () => {
    listening = false;
    setMicOff();
  };

  mic.onclick = async () => {
    if (!listening) {
      try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
      listening = true;
      setMicOn();
      lastFinal = ac.value.trim();
      try { rec.start(); } catch {}
    } else {
      listening = false;
      try { rec.stop(); } catch {}
      setMicOff();
    }
  };
}

(function hideLatLngAndFreezeTextarea(){
  const lat = qs('#lat'); const lng = qs('#lng');
  if (lat) lat.closest('.row')?.classList.add('hidden');
  if (lng) lng.closest('.row')?.classList.add('hidden');

  const ac = qs('#aciklama');
  if (ac) ac.style.resize = 'none';
})();

function attachMapClickForLoggedIn(){
  try { map?.off('click'); } catch {}
  if (!map) return;
  
  map.on('click', (e) => {
    stopLiveLocation(); 
    
    if (!allowBlackMarker()) {
      return;
    }
    
    if (liveMarker) { try { map.removeLayer(liveMarker); } catch {} ; liveMarker = null; }
    if (liveAccuracyCircle) { try { map.removeLayer(liveAccuracyCircle); } catch {} ; liveAccuracyCircle = null; }
    
    const { lat, lng } = e.latlng;
    const latEl = qs('#lat'); 
    const lngEl = qs('#lng');
    if (latEl) latEl.value = String(lat);
    if (lngEl) lngEl.value = String(lng);
    
    if (clickMarker) {
      clickMarker.setLatLng(e.latlng);
    } else {
      clickMarker = L.marker([lat, lng], { icon: BLACK_PIN() })
        .addTo(map)
        .bindPopup(t('selectedLocation'));
    }
    
    if (currentUser && currentUser.role === 'user') {
      const olayCard = qs('#olay-card');
      if (olayCard) {
        show(olayCard);
        ensureBackButton();
        
        const mapEl = document.getElementById('map');
        if (mapEl) {
          mapEl.classList.add('blur-background');
        }
        pushOverlayState('olay-card');
        
        ensureMapLegend(map);
      }
    }
  });
}

function detachMapClickForLoggedOut(){
  try { map?.off('click'); } catch {}
  if (clickMarker){ try { map.removeLayer(clickMarker); } catch{}; clickMarker = null; }
  if (liveMarker){ try { map.removeLayer(liveMarker); } catch{}; liveMarker = null; }
  if (liveAccuracyCircle){ try { map.removeLayer(liveAccuracyCircle); } catch{}; liveAccuracyCircle = null; }
}
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.overlay) {
  } else {
    const isOverlayVisible = anyOverlayVisible();
    
    if (isOverlayVisible) {
      event.preventDefault();
      restoreMapViewFromOverlay();
    }
  }
});

/* ==================== INITIALIZATION ==================== */
(async function init(){
  if (typeof window.t !== 'function') {
    console.error('i18n not loaded!');
    return;
  }
  
  if (typeof window.setLanguage === 'function') {
    window.setLanguage('en');
  }
  
  if (typeof window.loadTranslations === 'function') {
    await window.loadTranslations('en');
  }

  await updateUIWithNewLanguage();

  document.querySelectorAll('.language-selector button').forEach(btn => {
    btn.classList.remove('active');
  });
  const enBtn = document.getElementById('lang-en');
  if (enBtn) enBtn.classList.add('active');
  
  (function addHeaderLocationBtn(){
    const header = document.querySelector('header .wrap') || document.querySelector('header');
    if (!header) return;
    const existing = qs('#btn-use-location');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.id = 'btn-use-location';
    btn.className = 'btn ghost icon-btn';
    btn.innerHTML = `<img src="/useposition.svg" alt="${t('location')}" width="20" height="20" />`;
    btn.title = t('useMyLocation');
    btn.style.display = 'none';
    btn.onclick = () => {
      geoFindMeToggle();
      if (currentUser && currentUser.role === 'user') {
        const olayCard = qs('#olay-card');
        if (olayCard) {
          show(olayCard);
          ensureBackButton();
          const mapEl = document.getElementById('map');
          if (mapEl) mapEl.classList.add('blur-background');
        }
      }
    };
    
    const themeBtn = qs('#btn-theme-toggle');
    if (themeBtn && themeBtn.parentElement) {
      themeBtn.parentElement.insertBefore(btn, themeBtn);
    } else {
      const authDiv = header.querySelector('.auth');
      if (authDiv) {
        authDiv.insertBefore(btn, authDiv.firstChild);
      } else {
        header.appendChild(btn);
      }
    }
  })();
  
  loadToken();
  applySavedTheme();
  
  await applySiteConfig();
  wireEyes();
  setMediaButtonsAsIcons();
  initTabs();
  setupSpeechToText();
  placeMicIntoMediaBar();
  themeBtn()?.addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.classList.contains('theme-dark');
    setTheme(isDark ? 'light' : 'dark');
  });

  await loadAppConfig(); 
  await loadPageSizeSettings();
  try {
    const minZ = APP_CONFIG.mapMinZoom;
    const lat  = APP_CONFIG.mapInitialLat;
    const lng  = APP_CONFIG.mapInitialLng;
    const z    = APP_CONFIG.mapInitialZoom;

    try { map.setMinZoom(minZ); } catch {}
    try { map.setView([lat, lng], z, { animate:false }); } catch {}
  } catch(e){
    console.warn('[MAP INIT] .env/config values could not be applied:', e);
  }

  if (FORCE_DEFAULT_LOGIN_ON_LOAD) {
    saveToken(null);
    currentUser = null;
  } else {
    await checkMe();
  }

  const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
  const showBad = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);
  const showAny = showGood || showBad;
  
  if (!currentUser) {
    await goToDefaultLoginScreen();
    detachMapClickForLoggedOut();

    if (showAny) {
      try { 
        await loadExistingEvents({ publicMode: true });
        
        if (map && markersLayer && markersLayer.getLayers && markersLayer.getLayers().length > 0) {
          try {
            const group = L.featureGroup(markersLayer.getLayers());
            if (group.getLayers().length > 0) {
              map.fitBounds(group.getBounds().pad(0.15));
            }
          } catch(e) {
            console.warn('Map fit error:', e);
          }
        }
      } 
      catch(e){ 
        console.error('Public event load ERROR:', e); 
      }
    } else {
      try { if (markersLayer) markersLayer.clearLayers(); } catch {}
    }
    try { ensureMapLegend(map); } catch {}
  } else {
    goDefaultScreen();
    attachMapClickForLoggedIn();
    
    try { ensureMapLegend(map); } catch {}
  }

  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
    await Promise.all([
      loadOlayTypes(),
      refreshAdminUsers(),
      refreshAdminEvents()
    ]);
    
    setTimeout(() => {
      try {
        ensureEventsMap();
        ensureEventsExportControl();
        syncEventsMapWithFilteredEvents();
      } catch(e) {
        console.warn('[INIT] Admin map error:', e);
      }
    }, 500);
    
    try { ensureMapLegend(map); } catch {}
  }
})();


async function changeLanguage(lang) {
  if (typeof window.setLanguage === 'function') {
    window.setLanguage(lang);
    
    if (typeof window.loadTranslations === 'function') {
      await window.loadTranslations(lang);
    }
    
    await updateUIWithNewLanguage();
    
    document.querySelectorAll('.language-selector button').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeLangBtn = document.getElementById('lang-' + lang);
    if (activeLangBtn) {
      activeLangBtn.classList.add('active');
    }
    
    toast(t('languageChanged'), 'success');
  }
}

async function updateUIWithNewLanguage() {
  const siteTitle = document.getElementById('site-title');
  if (siteTitle && APP_CONFIG.siteTitle) {
    siteTitle.textContent = APP_CONFIG.siteTitle;
  }
  
  const loginUser = qs('#login-user');
  if (loginUser) loginUser.placeholder = t('usernameOrEmailPlaceholder');
  
  const loginPass = qs('#login-pass');
  if (loginPass) loginPass.placeholder = t('passwordPlaceholder');
  
  const loginTotp = qs('#login-totp');
  if (loginTotp) loginTotp.placeholder = t('verificationCode');
  
  const regUsername = qs('#reg-username');
  if (regUsername) regUsername.placeholder = t('usernamePlaceholder');
  
  const regEmail = qs('#reg-email');
  if (regEmail) regEmail.placeholder = t('registeredEmailPlaceholder');
  
  const regPass = qs('#reg-pass');
  if (regPass) regPass.placeholder = t('weakPasswordPlaceholder');
  
  const regName = qs('#reg-name');
  if (regName) regName.placeholder = t('firstNamePlaceholder');
  
  const regSurname = qs('#reg-surname');
  if (regSurname) regSurname.placeholder = t('lastNamePlaceholder');
  
  const fgEmail = qs('#fg-email');
  if (fgEmail) fgEmail.placeholder = t('registeredEmailPlaceholder');
  
  const fgCode = qs('#fg-code');
  if (fgCode) fgCode.placeholder = t('verificationCode');
  
  const fgPass1 = qs('#fg-pass1');
  if (fgPass1) fgPass1.placeholder = t('newPasswordPlaceholder');
  
  const fgPass2 = qs('#fg-pass2');
  if (fgPass2) fgPass2.placeholder = t('confirmNewPasswordPlaceholder');
  
  const aciklama = qs('#aciklama');
  if (aciklama) aciklama.placeholder = t('enterDescriptionPlaceholder');
  
  const newTypeName = qs('#new-type-name');
  if (newTypeName) newTypeName.placeholder = t('newEventTypeNamePlaceholder');
  
  const btnOpenLogin = document.querySelector('#btn-open-login');
  if (btnOpenLogin) btnOpenLogin.textContent = t('login');
  
  const btnLogout = document.querySelector('#btn-logout');
  if (btnLogout) btnLogout.textContent = t('logout');
  
  const whoami = document.querySelector('#whoami');
  if (whoami && currentUser) {
    whoami.textContent = t('greeting', { username: currentUser.username, role: currentUser.role });
  }
  
  const loginCard = document.querySelector('#login-card h2');
  if (loginCard) loginCard.textContent = t('login');
  
  document.querySelectorAll('#login-card label').forEach(label => {
    const forAttr = label.getAttribute('for');
    if (forAttr === 'login-user') label.textContent = t('usernameOrEmail') + ':';
    if (forAttr === 'login-pass') label.textContent = t('password') + ':';
    if (forAttr === 'login-totp') label.textContent = t('verificationCode') + ':';
  });
  
  const btnLogin = document.querySelector('#btn-login');
  if (btnLogin) btnLogin.textContent = t('login');
  
  const toggleRegister = document.querySelector('#toggle-register');
  if (toggleRegister) toggleRegister.textContent = t('dontHaveAccount');
  
  const gotoForgot = document.querySelector('#goto-forgot');
  if (gotoForgot) gotoForgot.textContent = t('forgotPassword');

  const registerCard = document.querySelector('#register-card h2');
  if (registerCard) registerCard.textContent = t('register');
  
  document.querySelectorAll('#register-card label').forEach(label => {
    const forAttr = label.getAttribute('for');
    if (forAttr === 'reg-username') label.textContent = t('username') + ':';
    if (forAttr === 'reg-email') label.textContent = t('email') + ':';
    if (forAttr === 'reg-pass') label.textContent = t('password') + ':';
    if (forAttr === 'reg-name') label.textContent = t('name') + ':';
    if (forAttr === 'reg-surname') label.textContent = t('surname') + ':';
  });
  
  const btnRegister = document.querySelector('#btn-register');
  if (btnRegister) btnRegister.textContent = t('register');
  
  const toggleLogin = document.querySelector('#toggle-login');
  if (toggleLogin) toggleLogin.textContent = t('alreadyHaveAccount');
  
  const forgotCard = document.querySelector('#forgot-card h2');
  if (forgotCard) forgotCard.textContent = t('passwordReset');
  
  document.querySelectorAll('#forgot-card label').forEach(label => {
    const forAttr = label.getAttribute('for');
    if (forAttr === 'fg-email') label.textContent = t('email') + ':';
    if (forAttr === 'fg-code') label.textContent = t('verificationCode') + ':';
    if (forAttr === 'fg-pass1') label.textContent = t('newPassword') + ':';
    if (forAttr === 'fg-pass2') label.textContent = t('confirmNewPassword') + ':';
  });
  
  const btnForgotStart = document.querySelector('#btn-forgot-start');
  if (btnForgotStart) btnForgotStart.textContent = t('sendCode');
  
  const btnForgotVerify = document.querySelector('#btn-forgot-verify');
  if (btnForgotVerify) btnForgotVerify.textContent = t('verifyCode');
  
  const btnForgotReset = document.querySelector('#btn-forgot-reset');
  if (btnForgotReset) btnForgotReset.textContent = t('resetPassword');
  
  const backToLogin = document.querySelector('#back-to-login');
  if (backToLogin) backToLogin.textContent = t('backToLogin');
  
  const olayCard = document.querySelector('#olay-card h2');
  if (olayCard) olayCard.textContent = t('addEvent');
  
  document.querySelectorAll('#olay-card label').forEach(label => {
    const forAttr = label.getAttribute('for');
    if (forAttr === 'olay_turu') {
      const micBtn = label.querySelector('#btn-stt');
      label.childNodes[0].textContent = t('eventType') + ':';
      if (micBtn) label.appendChild(micBtn);
    }
    if (forAttr === 'aciklama') {
      const micBtn = label.querySelector('#btn-stt');
      label.childNodes[0].textContent = t('description') + ':';
      if (micBtn) label.appendChild(micBtn);
    }
  });
  setupSpeechToText();
  
  const submitBtn = document.querySelector('#submit-btn');
  if (submitBtn) {
    if (submitBtn.classList.contains('updating')) {
      submitBtn.textContent = t('update');
    } else {
      submitBtn.textContent = t('submit');
    }
  }
  
  const cancelEditBtn = document.querySelector('#cancel-edit-btn');
  if (cancelEditBtn) cancelEditBtn.textContent = t('cancel');
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    if (tab === 'events-tab') btn.textContent = t('events');
    if (tab === 'types-tab') btn.textContent = t('eventTypes');
    if (tab === 'users-tab') btn.textContent = t('users');
  });
  
  const eventsTabH2 = document.querySelector('#events-tab h2');
  if (eventsTabH2) eventsTabH2.textContent = t('events');
  
  const typesTabH2 = document.querySelector('#types-tab h2');
  if (typesTabH2) typesTabH2.textContent = t('eventTypes');
  
  const usersTabH2 = document.querySelector('#users-tab h2');
  if (usersTabH2) usersTabH2.textContent = t('users');
  
  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
    updateTableHeaders();
    
    ['events', 'types', 'users'].forEach(tableKey => {
      if (tableStates[tableKey]) {
        renderTable(tableKey);
        
        setTimeout(() => {
          attachFilterEvents(tableKey);
          
          Object.keys(tableStates[tableKey].filters).forEach(column => {
            updateFilterIcon(tableKey, column);
          });
        }, 50);
      }
    });
  }
  
  const supBtnForm = document.querySelector('#sup-btn-form');
  if (supBtnForm) {
    supBtnForm.textContent = t('view');
    supBtnForm.title = t('eventView');
  }
  
  const supBtnAdmin = document.querySelector('#sup-btn-admin');
  if (supBtnAdmin) {
    supBtnAdmin.textContent = t('management');
    supBtnAdmin.title = t('managementPanel');
  }
  
  const newTypeNameLabel = Array.from(document.querySelectorAll('label')).find(l => 
    l.getAttribute('for') === 'new-type-name'
  );
  if (newTypeNameLabel) newTypeNameLabel.textContent = t('typeName') + ':';
  
  const btnAddType = document.querySelector('#btn-add-type');
  if (btnAddType) btnAddType.textContent = t('add');
  
  setMediaButtonsAsIcons();

  try {
    if (map) {
      const existingLegend = map.getContainer().querySelector('.map-legend');
      if (existingLegend) existingLegend.remove();
      ensureMapLegend(map);
    }
    if (eventsMap) {
      const existingLegend = eventsMap.getContainer().querySelector('.map-legend');
      if (existingLegend) existingLegend.remove();
      ensureMapLegend(eventsMap);
    }
  } catch(e) {
    console.warn('Map legend update error:', e);
  }
  const allowedDomainEl = qs('#allowed-domain');
  if (allowedDomainEl && APP_CONFIG.allowedEmailDomains && APP_CONFIG.allowedEmailDomains.length) {
    allowedDomainEl.textContent = APP_CONFIG.allowedEmailDomains.length === 1 
      ? t('allowedDomainSingular', { domain: APP_CONFIG.allowedEmailDomains[0] })
      : t('allowedDomainsPlural', { domains: APP_CONFIG.allowedEmailDomains.join(', ') });
  }
  
  const totpLabel = Array.from(document.querySelectorAll('#login-card label')).find(l => 
    l.getAttribute('for') === 'login-totp'
  );
  if (totpLabel) totpLabel.textContent = t('verificationCode') + ':';
  
  const olayTuruSelect = qs('#olay_turu');
  if (olayTuruSelect && olayTuruSelect.options[0]) {
    olayTuruSelect.options[0].text = `-- ${t('pleaseSelect')} --`;
  }
  if (map) {
    map.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.getPopup && layer.getPopup()) {
        const popup = layer.getPopup();
        if (popup.isOpen()) {
          eventIndex.forEach((evt) => {
            const markerLatLng = layer.getLatLng();
            const evtLat = parseFloat(evt.enlem);
            const evtLng = parseFloat(evt.boylam);
            
            if (Math.abs(markerLatLng.lat - evtLat) < 0.0001 && 
                Math.abs(markerLatLng.lng - evtLng) < 0.0001) {
              recreatePopupContent(evt, layer);
            }
          });
        }
      }
    });
  }
  
  if (currentUser) {
    await loadExistingEvents({ publicMode: false });
    if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
      await refreshAdminEvents();
    }
  } else {
    const showGood = boolFromConfigValue(APP_CONFIG.showGoodEventsOnLogin);
    const showBad = boolFromConfigValue(APP_CONFIG.showBadEventsOnLogin);
    if (showGood || showBad) {
      await loadExistingEvents({ publicMode: true });
    }
  }
}
function updateTableHeaders() {
  
  function rebuildHeader(header, newText, hasFilterIcon = true) {
    if (!header) return;
    let filterIcon = null;
    let filterDropdown = null;
    
    const icon = header.querySelector('.filter-icon');
    const dropdown = header.querySelector('.filter-dropdown');
    
    if (icon) {
      filterIcon = icon.cloneNode(true); 
    }
    if (dropdown) {
      filterDropdown = dropdown.cloneNode(true); 
    }
    header.innerHTML = '';
    
    const textContent = hasFilterIcon ? newText + ' ' : newText;
    const textNode = document.createTextNode(textContent);
    header.appendChild(textNode);
    if (hasFilterIcon && filterIcon) {
      header.appendChild(filterIcon);
    }
    if (filterDropdown) {
      header.appendChild(filterDropdown);
    }
  }
  
  // Events Table
  const eventHeaders = document.querySelector('#events-table thead tr');
  if (eventHeaders) {
    const headers = eventHeaders.querySelectorAll('th');
    
    rebuildHeader(headers[0], t('type'), true);           
    rebuildHeader(headers[1], t('description'), false);   
    rebuildHeader(headers[2], t('addedBy'), true);        
    rebuildHeader(headers[3], t('photo'), true);          
    rebuildHeader(headers[4], t('video'), true);          
    rebuildHeader(headers[5], t('addedDate'), true);      
    rebuildHeader(headers[6], t('actions'), false);       
  }
  
  // Types Table
  const typeHeaders = document.querySelector('#types-table thead tr');
  if (typeHeaders) {
    const headers = typeHeaders.querySelectorAll('th');
    
    rebuildHeader(headers[0], t('typeName'), true);       
    rebuildHeader(headers[1], t('good'), true);           
    rebuildHeader(headers[2], t('addedBy'), true);        
    rebuildHeader(headers[3], t('actions'), false);       
  }
  
  // Users Table
  const userHeaders = document.querySelector('#users-table thead tr');
  if (userHeaders) {
    const headers = userHeaders.querySelectorAll('th');
    
    rebuildHeader(headers[0], t('username'), true);       
    rebuildHeader(headers[1], t('role'), true);           
    rebuildHeader(headers[2], t('email'), true);          
    rebuildHeader(headers[3], t('verified'), true);      
    rebuildHeader(headers[4], t('actions'), false);       
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = qs('#btn-login');
  const btnRegister = qs('#btn-register');
  const btnLogout = qs('#btn-logout');
  const btnOpenLogin = qs('#btn-open-login');
  
  if (btnLogin) {
    btnLogin.addEventListener('click', login);
  }
  
  if (btnRegister) {
    btnRegister.addEventListener('click', register);
  }
  
  if (btnLogout) {
    btnLogout.addEventListener('click', logout);
  }
  
  if (btnOpenLogin) {
    btnOpenLogin.addEventListener('click', () => {
      hide(qs('#register-card'));
      hide(qs('#forgot-card'));
      hide(qs('#olay-card'));
      show(qs('#login-card'));
      
      ensureAuthBackButton('#login-card');
      
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.classList.add('blur-background');
      
      pushOverlayState('login-card');
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  const langTr = document.getElementById('lang-tr');
  const langEn = document.getElementById('lang-en');
  
  if (langTr) {
    langTr.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await changeLanguage('tr');
    });
  }
  
  if (langEn) {
    langEn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await changeLanguage('en');
    });
  }

  if (typeof window.getLanguage === 'function') {
    const currentLang = window.getLanguage();
    document.querySelectorAll('.language-selector button').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeLangBtn = document.getElementById('lang-' + currentLang);
    if (activeLangBtn) {
      activeLangBtn.classList.add('active');
    }
  }
});