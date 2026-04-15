/* ============================================================
   汤圆畅想屋 — v4 Application Logic
   Design: Retro Art Deco + Vinyl Record Aesthetics
   Features: Immersive fullscreen slideshow (images + video),
   Auto-play on idle, hierarchical categories, Netflix-style rows,
   Upload, Gallery, Lightbox, Edit, Delete, Filter,
   LocalStorage persistence, Drag & Drop
   ============================================================ */

;(function () {
  'use strict';

  // ============================================================
  //  ADMIN AUTHENTICATION SYSTEM
  //  Upload is restricted to admin only. Password is hashed with
  //  SHA-256 and compared client-side. Session can be remembered
  //  via sessionStorage.
  //  Default password: tangyuan2026
  //  ============================================================
  const ADMIN_HASH = 'a1b2c3d4e5'; // placeholder — we use simple hash below
  let isAdminAuthenticated = false;

  // Simple string hash for password verification (not cryptographically strong,
  // but sufficient for a client-side portfolio guard)
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  // The admin password — change this to whatever you want
  // Default: "tangyuan2026"
  const ADMIN_PASSWORD_HASH = simpleHash('tangyuan2026');

  function checkAdminSession() {
    const stored = sessionStorage.getItem('tangyuan_admin_auth');
    if (stored === ADMIN_PASSWORD_HASH) {
      isAdminAuthenticated = true;
      document.body.classList.add('admin-authenticated');
    }
  }

  function authenticateAdmin(password, remember) {
    const hash = simpleHash(password);
    if (hash === ADMIN_PASSWORD_HASH) {
      isAdminAuthenticated = true;
      document.body.classList.add('admin-authenticated');
      if (remember) {
        sessionStorage.setItem('tangyuan_admin_auth', ADMIN_PASSWORD_HASH);
      }
      return true;
    }
    return false;
  }

  function logoutAdmin() {
    isAdminAuthenticated = false;
    document.body.classList.remove('admin-authenticated');
    sessionStorage.removeItem('tangyuan_admin_auth');
  }

  // Check session on load
  checkAdminSession();

  // ============================================================
  //  CATEGORY SYSTEM
  // ============================================================
  const CATEGORIES = {
    photography: {
      label: '摄影',
      icon: 'camera',
      subcategories: {
        landscape: '风光', portrait: '人像', street: '街拍',
        architecture: '建筑', product: '产品', nature: '自然',
        travel: '旅行', night: '夜景', macro: '微距',
        documentary: '纪实', other_photo: '其他',
      }
    },
    painting: {
      label: '绘画',
      icon: 'palette',
      subcategories: {
        concept_art: '概念艺术', illustration: '插画',
        digital_painting: '数字绘画', traditional: '传统绘画',
        sketch: '速写/素描', character: '角色设计',
        environment: '环境/场景', matte_painting: '数字景观',
        fanart: '同人创作', other_paint: '其他',
      }
    },
    design: {
      label: '设计',
      icon: 'layers',
      subcategories: {
        interior: '室内设计', graphic: '平面设计',
        ui_ux: 'UI/UX', branding: '品牌设计',
        poster: '海报', packaging: '包装',
        motion: '动态设计', '3d': '3D 设计',
        typography: '字体设计', other_design: '其他',
      }
    },
    video: {
      label: '视频',
      icon: 'video',
      subcategories: {
        short_film: '短片', vlog: 'Vlog', music_video: 'MV',
        commercial: '商业广告', animation: '动画',
        documentary_film: '纪录片', showreel: 'Showreel',
        timelapse: '延时摄影', bts: '幕后花絮', other_video: '其他',
      }
    }
  };

  function getCategoryLabel(cat) { return CATEGORIES[cat]?.label || cat; }
  function getSubcategoryLabel(cat, sub) { return CATEGORIES[cat]?.subcategories?.[sub] || sub || ''; }
  function getSubcategories(cat) { return CATEGORIES[cat]?.subcategories || {}; }

  // ============================================================
  //  DATA STORE — IndexedDB for media, localStorage for metadata
  //  IndexedDB provides 50MB-hundreds of MB of storage,
  //  solving the localStorage 5MB limit that blocked uploads.
  // ============================================================
  const STORAGE_KEY = 'alpha_portfolio_works_v4';
  const DB_NAME = 'tangyuan_portfolio';
  const DB_VERSION = 1;
  const MEDIA_STORE = 'media';

  let db = null; // IndexedDB instance

  // Open / create IndexedDB
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(MEDIA_STORE)) {
          database.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      request.onerror = (e) => {
        console.error('IndexedDB open failed:', e);
        reject(e);
      };
    });
  }

  // Save a single media blob to IndexedDB
  function saveMedia(id, src) {
    return new Promise((resolve, reject) => {
      if (!db) { resolve(); return; }
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE);
      store.put({ id, src });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => { console.error('saveMedia error:', e); reject(e); };
    });
  }

  // Load a single media blob from IndexedDB
  function loadMedia(id) {
    return new Promise((resolve, reject) => {
      if (!db) { resolve(null); return; }
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.src : null);
      req.onerror = (e) => { console.error('loadMedia error:', e); resolve(null); };
    });
  }

  // Load all media from IndexedDB into a map { id: src }
  function loadAllMedia() {
    return new Promise((resolve, reject) => {
      if (!db) { resolve({}); return; }
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const store = tx.objectStore(MEDIA_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const map = {};
        (req.result || []).forEach(item => { map[item.id] = item.src; });
        resolve(map);
      };
      req.onerror = (e) => { console.error('loadAllMedia error:', e); resolve({}); };
    });
  }

  // Delete media from IndexedDB
  function deleteMedia(id) {
    return new Promise((resolve) => {
      if (!db) { resolve(); return; }
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // Save multiple media items in one transaction
  function saveMediaBatch(items) {
    return new Promise((resolve, reject) => {
      if (!db || items.length === 0) { resolve(); return; }
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE);
      items.forEach(({ id, src }) => store.put({ id, src }));
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => { console.error('saveMediaBatch error:', e); reject(e); };
    });
  }

  // ---- Metadata in localStorage (small JSON, no media) ----
  function loadWorksMeta() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function saveWorksMeta(w) {
    try {
      // Strip src from metadata — media lives in IndexedDB
      const meta = w.map(({ src, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
      return true;
    } catch (e) {
      console.error('localStorage save failed:', e);
      showToast('元数据保存失败');
      return false;
    }
  }

  // Legacy compat wrapper — used by existing code
  function saveWorks(w) {
    return saveWorksMeta(w);
  }

  // Compress image using canvas — returns a Promise<dataURL>
  // Always outputs JPEG for photos (much smaller than PNG base64)
  function compressImage(dataURL, maxWidth, maxHeight, quality) {
    maxWidth = maxWidth || 1920;
    maxHeight = maxHeight || 1920;
    quality = quality || 0.75;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Always use JPEG for better compression (photos don't need transparency)
        const compressed = canvas.toDataURL('image/jpeg', quality);

        resolve(compressed.length < dataURL.length ? compressed : dataURL);
      };
      img.onerror = () => resolve(dataURL);
      img.src = dataURL;
    });
  }

  // Migrate old data: move media from localStorage to IndexedDB
  async function migrateToIndexedDB() {
    const oldData = localStorage.getItem(STORAGE_KEY);
    if (!oldData) return;

    try {
      const oldWorks = JSON.parse(oldData);
      // Check if old data contains src (media embedded in localStorage)
      const hasEmbeddedMedia = oldWorks.some(w => w.src && w.src.length > 500);
      if (!hasEmbeddedMedia) return; // Already migrated or no media

      console.log('Migrating media from localStorage to IndexedDB...');
      const mediaItems = [];
      oldWorks.forEach(w => {
        if (w.src && w.src.length > 500) {
          mediaItems.push({ id: w.id, src: w.src });
        }
      });

      if (mediaItems.length > 0) {
        await saveMediaBatch(mediaItems);
      }

      // Save metadata without src
      saveWorksMeta(oldWorks);
      console.log(`Migration complete: ${mediaItems.length} media items moved to IndexedDB`);
    } catch (e) {
      console.error('Migration failed:', e);
    }
  }

  // Clear old v3 data
  if (localStorage.getItem('alpha_portfolio_works_v3')) {
    localStorage.removeItem('alpha_portfolio_works_v3');
  }

  let works = []; // Will be populated after IndexedDB init

  // Demo works
  const DEMO_WORKS = [
    {
      id: 'd1', title: '城市黄昏', category: 'photography', subcategory: 'landscape',
      desc: '日落时分的城市天际线', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a080e"/><stop offset=".35" stop-color="#1a1018"/><stop offset=".5" stop-color="#c87040"/><stop offset=".65" stop-color="#e8a850"/><stop offset="1" stop-color="#0a0a0e"/></linearGradient></defs><rect fill="url(#g)" width="1600" height="900"/><rect fill="#0a0a0e" y="600" width="1600" height="300"/><rect fill="#12101a" x="200" y="360" width="80" height="240" rx="2"/><rect fill="#12101a" x="350" y="280" width="120" height="320" rx="2"/><rect fill="#12101a" x="550" y="200" width="160" height="400" rx="2"/><rect fill="#12101a" x="800" y="300" width="100" height="300" rx="2"/><rect fill="#12101a" x="1000" y="340" width="130" height="260" rx="2"/><rect fill="#12101a" x="1250" y="400" width="90" height="200" rx="2"/><circle cx="1200" cy="160" r="60" fill="#e8a850" opacity=".7"/><rect fill="#c8a45a" x="380" y="320" width="20" height="15" opacity=".3" rx="1"/><rect fill="#d47040" x="580" y="260" width="20" height="15" opacity=".25" rx="1"/><rect fill="#c8a45a" x="1030" y="380" width="20" height="15" opacity=".2" rx="1"/></svg>'),
    },
    {
      id: 'd2', title: '静物光影', category: 'photography', subcategory: 'product',
      desc: '自然光下的静物摄影练习', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><radialGradient id="g"><stop offset="0" stop-color="#2a2018"/><stop offset="1" stop-color="#0a080a"/></radialGradient></defs><rect fill="url(#g)" width="1600" height="900"/><ellipse cx="800" cy="760" rx="350" ry="60" fill="#1a1510"/><rect fill="#c0a060" x="700" y="350" width="200" height="410" rx="8"/><circle cx="800" cy="320" r="120" fill="#c8a45a" opacity=".4"/><circle cx="800" cy="320" r="80" fill="#e8c87a" opacity=".25"/></svg>'),
    },
    {
      id: 'd3', title: '山间晨雾', category: 'photography', subcategory: 'nature',
      desc: '清晨山间薄雾弥漫', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0e14"/><stop offset=".4" stop-color="#1a2028"/><stop offset="1" stop-color="#4a5860"/></linearGradient></defs><rect fill="url(#sky)" width="1600" height="900"/><path d="M0 480 Q400 280 800 400 Q1200 240 1600 360 L1600 900 L0 900Z" fill="#1a2818" opacity=".7"/><path d="M0 580 Q500 420 900 530 Q1300 380 1600 480 L1600 900 L0 900Z" fill="#0e1810" opacity=".85"/><rect fill="#4a5860" y="440" width="1600" height="60" opacity=".08"/><circle cx="300" cy="200" r="40" fill="#e8c87a" opacity=".15"/></svg>'),
    },
    {
      id: 'd4', title: 'Art Deco 大厅', category: 'design', subcategory: 'interior',
      desc: 'Art Deco 风格室内概念设计', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect fill="#0a080e" width="1600" height="900"/><rect fill="#12101a" x="200" y="80" width="1200" height="740" rx="4"/><line x1="800" y1="80" x2="800" y2="820" stroke="#c8a45a" stroke-width="1" opacity=".12"/><line x1="200" y1="450" x2="1400" y2="450" stroke="#c8a45a" stroke-width="1" opacity=".12"/><path d="M800 120 L1050 350 L800 350Z" fill="#c8a45a" opacity=".04"/><path d="M800 120 L550 350 L800 350Z" fill="#d47040" opacity=".03"/><circle cx="800" cy="450" r="100" fill="none" stroke="#c8a45a" stroke-width="1" opacity=".12"/><circle cx="800" cy="450" r="160" fill="none" stroke="#e8c87a" stroke-width=".5" opacity=".08"/><circle cx="800" cy="450" r="220" fill="none" stroke="#c8a45a" stroke-width=".5" opacity=".05"/></svg>'),
    },
    {
      id: 'd5', title: '街头霓虹', category: 'photography', subcategory: 'street',
      desc: '雨夜街头的霓虹灯光', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect fill="#08060e" width="1600" height="900"/><rect fill="#c8a45a" x="300" y="150" width="300" height="50" rx="2" opacity=".35"/><rect fill="#d47040" x="900" y="250" width="280" height="40" rx="2" opacity=".3"/><rect fill="#e8c87a" x="400" y="450" width="250" height="45" rx="2" opacity=".25"/><rect fill="#c8a45a" x="1050" y="500" width="200" height="35" rx="2" opacity=".2"/><rect fill="#0a0a10" x="0" y="660" width="1600" height="240"/><ellipse cx="600" cy="690" rx="200" ry="15" fill="#c8a45a" opacity=".06"/><ellipse cx="1000" cy="700" rx="160" ry="12" fill="#d47040" opacity=".05"/></svg>'),
    },
    {
      id: 'd6', title: '仙侠意境', category: 'painting', subcategory: 'concept_art',
      desc: '中国奇幻风格概念画', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#08080e"/><stop offset=".4" stop-color="#0e1820"/><stop offset=".7" stop-color="#1a2830"/><stop offset="1" stop-color="#08080e"/></linearGradient></defs><rect fill="url(#g)" width="1600" height="900"/><circle cx="1200" cy="140" r="70" fill="#e8e0c8" opacity=".5"/><circle cx="1200" cy="140" r="90" fill="none" stroke="#c8a45a" stroke-width="1" opacity=".1"/><path d="M0 560 Q200 420 400 520 Q600 360 800 460 Q1000 320 1200 420 Q1400 320 1600 380 L1600 900 L0 900Z" fill="#0e2018" opacity=".6"/><path d="M0 700 Q300 600 600 680 Q900 550 1200 650 Q1400 580 1600 620 L1600 900 L0 900Z" fill="#081410" opacity=".7"/></svg>'),
    },
    {
      id: 'd7', title: '角色立绘', category: 'painting', subcategory: 'character',
      desc: '游戏角色概念设计', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect fill="#0a080e" width="1600" height="900"/><circle cx="800" cy="280" r="80" fill="#1a1520"/><rect fill="#1a1520" x="720" y="360" width="160" height="200" rx="12"/><rect fill="#14101c" x="700" y="560" width="70" height="160" rx="6"/><rect fill="#14101c" x="830" y="560" width="70" height="160" rx="6"/><circle cx="775" cy="265" r="10" fill="#c8a45a" opacity=".5"/><circle cx="825" cy="265" r="10" fill="#c8a45a" opacity=".5"/><path d="M700 300 Q800 340 900 300" stroke="#e8c87a" stroke-width="2" fill="none" opacity=".15"/></svg>'),
    },
    {
      id: 'd8', title: 'UI 概念稿', category: 'design', subcategory: 'ui_ux',
      desc: '移动端应用界面设计', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect fill="#0a080e" width="1600" height="900"/><rect fill="#12101a" x="560" y="60" width="480" height="780" rx="20"/><rect fill="#c8a45a" x="600" y="110" width="400" height="50" rx="4" opacity=".12"/><rect fill="#18162a" x="600" y="190" width="400" height="140" rx="6"/><rect fill="#18162a" x="600" y="360" width="190" height="120" rx="6"/><rect fill="#18162a" x="810" y="360" width="190" height="120" rx="6"/><rect fill="#c8a45a" x="600" y="700" width="400" height="56" rx="4" opacity=".3"/><circle cx="800" cy="810" r="18" fill="none" stroke="#3a3530" stroke-width="2"/></svg>'),
    },
    {
      id: 'd9', title: '建筑夜景', category: 'photography', subcategory: 'architecture',
      desc: '现代建筑的夜间灯光', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect fill="#06060a" width="1600" height="900"/><rect fill="#0e0c14" x="300" y="100" width="280" height="600" rx="2"/><rect fill="#0e0c14" x="750" y="180" width="340" height="520" rx="2"/><rect fill="#0e0c14" x="1200" y="250" width="200" height="450" rx="2"/><rect fill="#c8a45a" x="340" y="150" width="40" height="28" rx="2" opacity=".25"/><rect fill="#d47040" x="420" y="250" width="40" height="28" rx="2" opacity=".18"/><rect fill="#c8a45a" x="340" y="350" width="40" height="28" rx="2" opacity=".2"/><rect fill="#e8c87a" x="800" y="250" width="40" height="28" rx="2" opacity=".22"/><rect fill="#c8a45a" x="900" y="380" width="40" height="28" rx="2" opacity=".15"/><rect fill="#d47040" x="800" y="500" width="40" height="28" rx="2" opacity=".18"/><rect fill="#0a0a10" y="700" width="1600" height="200"/></svg>'),
    },
    {
      id: 'd10', title: '海报设计', category: 'design', subcategory: 'poster',
      desc: '活动宣传海报', mediaType: 'image',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8a45a"/><stop offset="1" stop-color="#d47040"/></linearGradient></defs><rect fill="#08060c" width="1600" height="900"/><circle cx="800" cy="450" r="250" fill="none" stroke="url(#p)" stroke-width="1.5" opacity=".2"/><circle cx="800" cy="450" r="170" fill="none" stroke="url(#p)" stroke-width="1" opacity=".12"/><circle cx="800" cy="450" r="330" fill="none" stroke="url(#p)" stroke-width=".8" opacity=".08"/><circle cx="800" cy="450" r="90" fill="none" stroke="url(#p)" stroke-width=".5" opacity=".1"/><rect fill="#c8a45a" x="640" y="440" width="320" height="3" rx="1.5" opacity=".2"/><rect fill="#d47040" x="700" y="460" width="200" height="2" rx="1" opacity=".15"/></svg>'),
    },
  ];

  // Demo init is deferred to after IndexedDB opens — see initApp()

  // ============================================================
  //  DOM REFS
  // ============================================================
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const loader          = $('#loader');
  const navbar          = $('#navbar');
  const hamburger       = $('#hamburger');
  const mobileMenu      = $('#mobileMenu');
  const galleryContainer = $('#galleryContainer');
  const galleryEmpty    = $('#galleryEmpty');
  const subcategoryBar  = $('#subcategoryBar');
  const uploadModal     = $('#uploadModal');
  const editModal       = $('#editModal');
  const lightbox        = $('#lightbox');
  const toast           = $('#toast');

  // Hero slideshow
  const heroSlideshow   = $('#heroSlideshow');
  const heroIndicators  = $('#heroIndicators');
  const slideCounter    = $('#slideCounter');
  const slideTitle      = $('#slideTitle');

  // ============================================================
  //  LOADER
  // ============================================================
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hidden'), 1000);
  });

  // ============================================================
  //  NAVBAR
  // ============================================================
  const sectionActiveLight = $('#sectionActiveLight');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);

    const sections = ['contact', 'about', 'works', 'hero'];
    let currentSectionId = 'hero';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < window.innerHeight / 2) {
        currentSectionId = id;
        break;
      }
    }
    $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.section === currentSectionId));

    // Right-side warm light indicator — visible when scrolling past hero
    if (sectionActiveLight) {
      const isInsideContent = window.scrollY > window.innerHeight * 0.5;
      sectionActiveLight.classList.toggle('visible', isInsideContent);
    }
  }, { passive: true });

  // Mobile menu
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });
  $$('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  // Nav dropdown -> jump to works with category
  $$('.nav-dropdown-menu a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      setActiveCategory(a.dataset.category);
      document.getElementById('works').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // ============================================================
  //  TOAST
  // ============================================================
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ============================================================
  //  HERO STATS
  // ============================================================
  function updateStats() {
    const count = cat => works.filter(w => w.category === cat).length;
    animateNumber($('#statPhotos'), count('photography'));
    animateNumber($('#statPaintings'), count('painting'));
    animateNumber($('#statDesigns'), count('design'));
    animateNumber($('#statVideos'), count('video'));
  }

  function animateNumber(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    const duration = 600;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(current + (target - current) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ============================================================
  //  HERO FULLSCREEN SLIDESHOW
  // ============================================================
  const SLIDE_DURATION = 6000; // ms per slide
  const SLIDE_TRANSITION = 1800; // CSS transition duration
  let heroSlides = [];
  let heroSlideIdx = 0;
  let heroTimer = null;
  let idleTimer = null;
  let isIdleAutoPlay = false;

  function getHeroWorks() {
    // Use all works as potential hero backgrounds
    return works.filter(w => w.src);
  }

  function buildHeroSlides() {
    const heroWorks = getHeroWorks();
    if (heroWorks.length === 0) return;

    heroSlideshow.innerHTML = '';
    heroIndicators.innerHTML = '';
    heroSlides = [];

    heroWorks.forEach((w, i) => {
      // Create slide element
      const slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' active' : '');

      if (w.mediaType === 'video' && w.src.startsWith('data:video')) {
        const video = document.createElement('video');
        video.src = w.src;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = (i === 0);
        slide.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = w.src;
        img.alt = w.title;
        img.loading = (i < 3) ? 'eager' : 'lazy';
        slide.appendChild(img);
      }

      heroSlideshow.appendChild(slide);
      heroSlides.push({ el: slide, work: w });

      // Create indicator dot
      const dot = document.createElement('div');
      dot.className = 'slide-dot' + (i === 0 ? ' active' : '');
      dot.style.setProperty('--slide-duration', SLIDE_DURATION + 'ms');
      dot.addEventListener('click', () => goToSlide(i));
      heroIndicators.appendChild(dot);
    });

    updateSlideInfo(0);
  }

  function goToSlide(idx) {
    if (heroSlides.length === 0) return;
    const prevIdx = heroSlideIdx;
    const newIdx = idx % heroSlides.length;
    if (newIdx === prevIdx) return;

    // Previous slide — add leaving effect
    const prevSlide = heroSlides[prevIdx];
    if (prevSlide) {
      prevSlide.el.classList.remove('active');
      prevSlide.el.classList.add('leaving');
      const prevVideo = prevSlide.el.querySelector('video');
      if (prevVideo) prevVideo.pause();
      // Clean up leaving class after transition
      setTimeout(() => prevSlide.el.classList.remove('leaving'), 2200);
    }

    heroSlideIdx = newIdx;
    const currentSlide = heroSlides[heroSlideIdx];

    // Activate new slide
    heroSlides.forEach((s, i) => {
      if (i !== prevIdx) s.el.classList.remove('active', 'leaving');
    });
    currentSlide.el.classList.add('active');

    // Play current video if any
    const currentVideo = currentSlide.el.querySelector('video');
    if (currentVideo) {
      currentVideo.currentTime = 0;
      currentVideo.play().catch(() => {});
    }

    // Update indicators with smooth animation reset
    const dots = heroIndicators.querySelectorAll('.slide-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === heroSlideIdx);
      // Reset animation by removing and re-adding the element
      if (i === heroSlideIdx) {
        const clone = dot.cloneNode(true);
        clone.addEventListener('click', () => goToSlide(i));
        dot.parentNode.replaceChild(clone, dot);
      }
    });

    updateSlideInfo(heroSlideIdx);
  }

  function nextSlide() {
    goToSlide((heroSlideIdx + 1) % heroSlides.length);
  }

  function updateSlideInfo(idx) {
    if (heroSlides.length === 0) return;
    const total = heroSlides.length;
    const num = String(idx + 1).padStart(2, '0');
    const tot = String(total).padStart(2, '0');
    slideCounter.textContent = `${num} / ${tot}`;
    slideTitle.textContent = heroSlides[idx]?.work?.title || '';
  }

  function startSlideshow() {
    stopSlideshow();
    if (heroSlides.length <= 1) return;
    heroTimer = setInterval(nextSlide, SLIDE_DURATION);
  }

  function stopSlideshow() {
    if (heroTimer) {
      clearInterval(heroTimer);
      heroTimer = null;
    }
  }

  // Idle auto-play: restart slideshow after inactivity
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!heroTimer && heroSlides.length > 1) {
        startSlideshow();
        isIdleAutoPlay = true;
      }
    }, 10000); // 10s idle -> start auto-play
  }

  // User activity listeners
  ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll'].forEach(evt => {
    document.addEventListener(evt, () => {
      if (isIdleAutoPlay) {
        // Don't stop on hero scroll hint usage
      }
      resetIdleTimer();
    }, { passive: true });
  });

  // ============================================================
  //  CATEGORY & SUBCATEGORY STATE
  // ============================================================
  let currentCategory = 'all';
  let currentSubcategory = 'all';

  function setActiveCategory(cat) {
    currentCategory = cat;
    currentSubcategory = 'all';
    $$('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.category === cat));
    renderSubcategories();
    renderGallery();
  }

  $$('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveCategory(tab.dataset.category));
  });

  function renderSubcategories() {
    if (currentCategory === 'all') {
      subcategoryBar.innerHTML = '';
      subcategoryBar.style.display = 'none';
      return;
    }
    subcategoryBar.style.display = 'flex';
    const subs = getSubcategories(currentCategory);
    let html = '<button class="sub-tag active" data-sub="all">全部</button>';
    for (const [key, label] of Object.entries(subs)) {
      const count = works.filter(w => w.category === currentCategory && w.subcategory === key).length;
      if (count > 0) {
        html += `<button class="sub-tag" data-sub="${key}">${label} <span style="opacity:.5;font-size:10px">${count}</span></button>`;
      }
    }
    subcategoryBar.innerHTML = html;

    subcategoryBar.querySelectorAll('.sub-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        subcategoryBar.querySelectorAll('.sub-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        currentSubcategory = tag.dataset.sub;
        renderGallery();
      });
    });
  }

  // ============================================================
  //  GALLERY RENDERING
  // ============================================================
  function getFilteredWorks() {
    let filtered = works;
    if (currentCategory !== 'all') filtered = filtered.filter(w => w.category === currentCategory);
    if (currentSubcategory !== 'all') filtered = filtered.filter(w => w.subcategory === currentSubcategory);
    return filtered;
  }

  function renderGallery() {
    const filtered = getFilteredWorks();
    if (filtered.length === 0) {
      galleryContainer.innerHTML = '';
      galleryEmpty.style.display = 'block';
      updateStats();
      return;
    }
    galleryEmpty.style.display = 'none';

    if (currentCategory === 'all') {
      renderRowLayout(filtered);
    } else {
      renderGridLayout(filtered);
    }

    updateStats();
    bindCardClicks();
    observeGalleryRows();
  }

  function renderRowLayout(allWorks) {
    let html = '';
    for (const [catKey, catData] of Object.entries(CATEGORIES)) {
      const catWorks = allWorks.filter(w => w.category === catKey);
      if (catWorks.length === 0) continue;
      html += `
        <div class="gallery-row" style="margin-bottom:48px">
          <div class="gallery-row-header">
            <h3 class="gallery-row-title">${catData.label}</h3>
            <span class="gallery-row-count">${catWorks.length} 件作品</span>
          </div>
          <div class="gallery-row-scroll">
            ${catWorks.map((w, i) => renderCard(w, i)).join('')}
          </div>
        </div>
      `;
    }
    galleryContainer.innerHTML = html;
  }

  function renderGridLayout(filteredWorks) {
    galleryContainer.innerHTML = `
      <div class="gallery-grid">
        ${filteredWorks.map((w, i) => renderCard(w, i)).join('')}
      </div>
    `;
  }

  function renderCard(w, i) {
    const subLabel = getSubcategoryLabel(w.category, w.subcategory);
    const isVideo = w.mediaType === 'video';
    const mediaHtml = isVideo
      ? `<video src="${w.src}" muted loop playsinline preload="metadata"></video>`
      : `<img src="${w.src}" alt="${w.title}" loading="lazy" />`;
    const videoBadge = isVideo
      ? '<div class="gallery-card-video-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg> VIDEO</div>'
      : '';

    return `
      <div class="gallery-card" data-id="${w.id}" style="animation: cardFadeIn .5s ${i * 0.05}s both">
        <div class="gallery-card-image">${mediaHtml}</div>
        ${videoBadge}
        <div class="gallery-card-info">
          <div class="gallery-card-title">${w.title}</div>
          <div class="gallery-card-cat">${subLabel || getCategoryLabel(w.category)}</div>
        </div>
      </div>
    `;
  }

  function bindCardClicks() {
    $$('.gallery-card').forEach(el => {
      el.addEventListener('click', () => openLightbox(el.dataset.id));
      // Hover play for video cards
      const vid = el.querySelector('video');
      if (vid) {
        el.addEventListener('mouseenter', () => vid.play().catch(() => {}));
        el.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
      }
    });
  }

  // Card animation keyframes
  if (!document.getElementById('dynamic-keyframes')) {
    const style = document.createElement('style');
    style.id = 'dynamic-keyframes';
    style.textContent = `
      @keyframes cardFadeIn {
        from { opacity: 0; transform: translateY(16px) scale(.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  //  UPLOAD MODAL
  // ============================================================
  let pendingFiles = [];

  // Admin password modal elements
  const adminModal     = $('#adminModal');
  const adminPassword  = $('#adminPassword');
  const adminError     = $('#adminError');
  const adminRemember  = $('#adminRemember');

  function openAdminModal() {
    adminPassword.value = '';
    adminError.textContent = '';
    adminModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => adminPassword.focus(), 300);
  }
  function closeAdminModal() {
    adminModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  $('#adminModalClose').addEventListener('click', closeAdminModal);
  adminModal.querySelector('.modal-backdrop').addEventListener('click', closeAdminModal);

  $('#adminSubmit').addEventListener('click', () => {
    const pw = adminPassword.value;
    if (!pw) {
      adminError.textContent = '请输入密码';
      return;
    }
    if (authenticateAdmin(pw, adminRemember.checked)) {
      closeAdminModal();
      showToast('管理员验证成功 ✓');
      // Now open upload modal
      openUploadModal();
    } else {
      adminError.textContent = '密码错误，请重试';
      adminPassword.value = '';
      adminPassword.focus();
      // Shake animation
      adminModal.querySelector('.modal-content').style.animation = 'shake .4s ease';
      setTimeout(() => {
        adminModal.querySelector('.modal-content').style.animation = '';
      }, 400);
    }
  });

  // Enter key submits password
  adminPassword.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#adminSubmit').click();
  });

  function openUploadModal() {
    pendingFiles = [];
    $('#uploadPreviews').innerHTML = '';
    $('#uploadTitle').value = '';
    $('#uploadDesc').value = '';
    $('#uploadCategory').value = 'photography';
    $('#uploadMediaType').value = 'image';
    populateSubcategorySelect('uploadSubcategory', 'photography');
    uploadModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeUploadModal() {
    uploadModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Upload button — check admin first
  function handleUploadClick() {
    if (isAdminAuthenticated) {
      openUploadModal();
    } else {
      openAdminModal();
    }
  }

  $('#navUploadBtn').addEventListener('click', handleUploadClick);
  $('#mobileUploadBtn')?.addEventListener('click', e => {
    e.preventDefault();
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
    handleUploadClick();
  });
  $('#modalClose').addEventListener('click', closeUploadModal);
  uploadModal.querySelector('.modal-backdrop').addEventListener('click', closeUploadModal);

  $('#uploadCategory').addEventListener('change', () => {
    populateSubcategorySelect('uploadSubcategory', $('#uploadCategory').value);
  });
  $('#editCategory').addEventListener('change', () => {
    populateSubcategorySelect('editSubcategory', $('#editCategory').value);
  });

  function populateSubcategorySelect(selectId, category) {
    const select = document.getElementById(selectId);
    const subs = getSubcategories(category);
    select.innerHTML = Object.entries(subs)
      .map(([key, label]) => `<option value="${key}">${label}</option>`)
      .join('');
  }

  // Drop zone
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');

  dropZone.addEventListener('click', e => {
    if (e.target.closest('.drop-zone-browse') || e.target === dropZone ||
        e.target.closest('.drop-zone-icon') || e.target.closest('.drop-zone-main') ||
        e.target.closest('.drop-zone-or') || e.target.closest('.drop-zone-hint')) {
      fileInput.click();
    }
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  function handleFiles(fileList) {
    [...fileList].forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) return;

      // Check file size — warn if very large
      if (file.size > 10 * 1024 * 1024) {
        showToast(`文件 ${file.name} 过大（>${Math.round(file.size/1024/1024)}MB），可能导致存储失败`);
      }

      const reader = new FileReader();
      reader.onload = async e => {
        let src = e.target.result;

        // Compress images to save localStorage space
        if (isImage) {
          try {
            src = await compressImage(src, 1920, 1920, 0.75);
          } catch (err) {
            console.warn('Image compression failed, using original:', err);
          }
        }

        pendingFiles.push({
          name: file.name,
          src: src,
          type: isVideo ? 'video' : 'image'
        });
        // Auto-set media type
        if (isVideo) $('#uploadMediaType').value = 'video';
        renderPreviews();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPreviews() {
    const container = $('#uploadPreviews');
    container.innerHTML = pendingFiles.map((f, i) => {
      const mediaEl = f.type === 'video'
        ? `<video src="${f.src}" muted></video>`
        : `<img src="${f.src}" alt="" />`;
      return `
        <div class="upload-preview">
          ${mediaEl}
          <div class="upload-preview-remove" data-idx="${i}">&times;</div>
        </div>
      `;
    }).join('');
    container.querySelectorAll('.upload-preview-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        pendingFiles.splice(+btn.dataset.idx, 1);
        renderPreviews();
      });
    });
  }

  // Submit upload
  $('#uploadSubmit').addEventListener('click', async () => {
    if (pendingFiles.length === 0) {
      showToast('请先选择文件');
      return;
    }

    const title = $('#uploadTitle').value.trim() || '未命名作品';
    const category = $('#uploadCategory').value;
    const subcategory = $('#uploadSubcategory').value;
    const mediaType = $('#uploadMediaType').value;
    const desc = $('#uploadDesc').value.trim();

    const newWorks = [];
    const mediaItems = [];

    pendingFiles.forEach((f, i) => {
      const id = 'w' + Date.now() + '_' + i;
      newWorks.push({
        id,
        title: pendingFiles.length === 1 ? title : `${title} (${i + 1})`,
        category,
        subcategory,
        mediaType: f.type || mediaType,
        desc,
        src: f.src, // Keep in memory for immediate display
      });
      mediaItems.push({ id, src: f.src });
    });

    // Save media to IndexedDB
    try {
      await saveMediaBatch(mediaItems);
    } catch (e) {
      showToast('图片存储失败，请重试');
      console.error('IndexedDB save failed:', e);
      return;
    }

    // Prepend new works to array
    works = [...newWorks, ...works];

    // Save metadata (without src) to localStorage
    const saved = saveWorksMeta(works);
    if (!saved) {
      // Rollback media from IndexedDB
      for (const item of mediaItems) {
        await deleteMedia(item.id);
      }
      works = works.slice(newWorks.length); // Remove new items
      return;
    }

    renderSubcategories();
    renderGallery();
    buildHeroSlides();
    startSlideshow();
    closeUploadModal();
    showToast(`已上传 ${pendingFiles.length} 件作品 ✓`);
  });

  // ============================================================
  //  LIGHTBOX
  // ============================================================
  let lbIndex = -1;
  let lbFiltered = [];

  function openLightbox(id) {
    lbFiltered = getFilteredWorks();
    lbIndex = lbFiltered.findIndex(w => w.id === id);
    if (lbIndex < 0) return;
    showLightboxItem();
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    stopSlideshow();
  }

  function showLightboxItem() {
    const w = lbFiltered[lbIndex];
    if (!w) return;

    const lbImage = $('#lbImage');
    const lbVideo = $('#lbVideo');

    if (w.mediaType === 'video') {
      lbImage.style.display = 'none';
      lbVideo.style.display = 'block';
      lbVideo.src = w.src;
      lbVideo.play().catch(() => {});
    } else {
      lbVideo.style.display = 'none';
      lbVideo.pause();
      lbImage.style.display = 'block';
      lbImage.src = w.src;
    }

    $('#lbTitle').textContent = w.title;
    $('#lbDesc').textContent = w.desc || '';
    $('#lbCategory').textContent = getCategoryLabel(w.category);
    const subLabel = getSubcategoryLabel(w.category, w.subcategory);
    const subEl = $('#lbSubcategory');
    if (subLabel) {
      subEl.textContent = subLabel;
      subEl.style.display = 'inline-block';
    } else {
      subEl.style.display = 'none';
    }
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    $('#lbVideo').pause();
    startSlideshow();
  }

  $('#lbClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  $('#lbPrev').addEventListener('click', e => {
    e.stopPropagation();
    lbIndex = (lbIndex - 1 + lbFiltered.length) % lbFiltered.length;
    showLightboxItem();
  });
  $('#lbNext').addEventListener('click', e => {
    e.stopPropagation();
    lbIndex = (lbIndex + 1) % lbFiltered.length;
    showLightboxItem();
  });

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') { lbIndex = (lbIndex - 1 + lbFiltered.length) % lbFiltered.length; showLightboxItem(); }
    if (e.key === 'ArrowRight') { lbIndex = (lbIndex + 1) % lbFiltered.length; showLightboxItem(); }
  });

  // Delete from lightbox
  $('#lbDelete').addEventListener('click', async () => {
    if (!isAdminAuthenticated) return;
    const w = lbFiltered[lbIndex];
    if (!w) return;
    if (!confirm(`确定要删除「${w.title}」吗？`)) return;
    works = works.filter(x => x.id !== w.id);
    saveWorks(works);
    await deleteMedia(w.id); // Remove media from IndexedDB
    closeLightbox();
    renderSubcategories();
    renderGallery();
    buildHeroSlides();
    startSlideshow();
    showToast('已删除');
  });

  // ============================================================
  //  WATERMARK DOWNLOAD — Adds handwritten "汤圆" watermark
  //  Uses Canvas API to composite watermark onto image/video frame
  //  Only non-admin downloads get watermarked
  // ============================================================

  function addWatermarkAndDownload(sourceEl, filename, isVideo) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let sourceWidth, sourceHeight;

    if (isVideo) {
      sourceWidth = sourceEl.videoWidth || sourceEl.width || 1920;
      sourceHeight = sourceEl.videoHeight || sourceEl.height || 1080;
    } else {
      sourceWidth = sourceEl.naturalWidth || sourceEl.width || 1920;
      sourceHeight = sourceEl.naturalHeight || sourceEl.height || 1080;
    }

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    // Draw the source
    ctx.drawImage(sourceEl, 0, 0, sourceWidth, sourceHeight);

    // Determine if admin — if admin, skip watermark
    if (!isAdminAuthenticated) {
      // Calculate watermark size based on image dimensions
      const minDim = Math.min(sourceWidth, sourceHeight);
      const fontSize = Math.max(24, Math.round(minDim * 0.06));

      // Draw multiple watermarks across the image in a diagonal pattern
      ctx.save();
      ctx.font = `${fontSize}px "Liu Jian Mao Cao", "Noto Serif SC", cursive`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Rotate for diagonal watermark pattern
      const spacing = fontSize * 5;
      const diagonal = Math.sqrt(sourceWidth * sourceWidth + sourceHeight * sourceHeight);
      const cols = Math.ceil(diagonal / spacing) + 2;
      const rows = Math.ceil(diagonal / spacing) + 2;

      ctx.translate(sourceWidth / 2, sourceHeight / 2);
      ctx.rotate(-Math.PI / 6); // 30 degree tilt

      for (let r = -rows; r <= rows; r++) {
        for (let c = -cols; c <= cols; c++) {
          const x = c * spacing;
          const y = r * spacing;
          ctx.fillText('汤圆', x, y);
        }
      }
      ctx.restore();

      // Also draw a larger corner watermark
      ctx.save();
      const cornerFontSize = Math.max(36, Math.round(minDim * 0.08));
      ctx.font = `${cornerFontSize}px "Liu Jian Mao Cao", "Noto Serif SC", cursive`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('汤圆', sourceWidth - cornerFontSize * 0.5, sourceHeight - cornerFontSize * 0.4);
      ctx.restore();
    }

    // Convert to blob and trigger download
    canvas.toBlob(blob => {
      if (!blob) {
        showToast('下载失败，请重试');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('已下载' + (isAdminAuthenticated ? '' : '（含水印）') + ' ✓');
    }, 'image/png', 0.95);
  }

  // Download button click handler
  $('#lbDownload').addEventListener('click', () => {
    const w = lbFiltered[lbIndex];
    if (!w) return;

    const isVideo = w.mediaType === 'video';
    const extension = isAdminAuthenticated ? (isVideo ? '.mp4' : '.png') : '.png';
    const filename = (w.title || 'tangyuan_work') + extension;

    if (isAdminAuthenticated && !isVideo) {
      // Admin: direct download without watermark for images
      const a = document.createElement('a');
      a.href = w.src;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('已下载（原图）✓');
      return;
    }

    if (isAdminAuthenticated && isVideo) {
      // Admin: direct download for video
      const a = document.createElement('a');
      a.href = w.src;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('已下载（原视频）✓');
      return;
    }

    // Non-admin: add watermark
    if (isVideo) {
      // For video, capture current frame as image with watermark
      const video = $('#lbVideo');
      if (video && video.readyState >= 2) {
        addWatermarkAndDownload(video, w.title + '_frame.png', true);
      } else {
        showToast('视频未加载完成，请稍后重试');
      }
    } else {
      // For images, load into an Image object and watermark
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        addWatermarkAndDownload(img, filename, false);
      };
      img.onerror = () => {
        // Fallback: try downloading the visible image directly
        const lbImg = $('#lbImage');
        if (lbImg) {
          addWatermarkAndDownload(lbImg, filename, false);
        } else {
          showToast('下载失败，请重试');
        }
      };
      img.src = w.src;
    }
  });

  // ============================================================
  //  EDIT MODAL
  // ============================================================
  let editingId = null;

  $('#lbEdit').addEventListener('click', () => {
    if (!isAdminAuthenticated) return;
    const w = lbFiltered[lbIndex];
    if (!w) return;
    editingId = w.id;
    $('#editTitle').value = w.title;
    $('#editCategory').value = w.category;
    populateSubcategorySelect('editSubcategory', w.category);
    $('#editSubcategory').value = w.subcategory || '';
    $('#editDesc').value = w.desc || '';
    closeLightbox();
    editModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  function closeEditModal() {
    editModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  $('#editModalClose').addEventListener('click', closeEditModal);
  editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);

  $('#editSubmit').addEventListener('click', () => {
    const idx = works.findIndex(w => w.id === editingId);
    if (idx < 0) return;
    works[idx].title = $('#editTitle').value.trim() || '未命名';
    works[idx].category = $('#editCategory').value;
    works[idx].subcategory = $('#editSubcategory').value;
    works[idx].desc = $('#editDesc').value.trim();
    saveWorks(works);
    renderSubcategories();
    renderGallery();
    buildHeroSlides();
    closeEditModal();
    showToast('已保存修改 ✓');
  });

  // ============================================================
  //  ESCAPE KEY
  // ============================================================
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (adminModal.classList.contains('open')) closeAdminModal();
      else if (editModal.classList.contains('open')) closeEditModal();
      else if (uploadModal.classList.contains('open')) closeUploadModal();
    }
  });

  // ============================================================
  //  SCROLL REVEAL — Enhanced Section Transitions
  // ============================================================

  // Section-level reveal observer
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        sectionObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

  // Gallery row reveal observer
  const rowObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('row-revealed');
        rowObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  // Setup section reveals
  function setupSectionReveals() {
    // Mark sections with reveal class
    document.querySelectorAll('.about-section, .contact-section').forEach(el => {
      el.classList.add('section-reveal');
      sectionObserver.observe(el);
    });

    // Mark children with reveal-child class for stagger
    document.querySelectorAll('.about-text > *, .contact-grid .contact-card').forEach(el => {
      el.classList.add('reveal-child');
    });

    // Section dividers
    document.querySelectorAll('.section-divider').forEach(el => {
      sectionObserver.observe(el);
    });
  }

  // Re-observe gallery rows after render
  function observeGalleryRows() {
    document.querySelectorAll('.gallery-row').forEach((row, i) => {
      row.style.transitionDelay = `${i * 0.12}s`;
      rowObserver.observe(row);
    });
  }

  // Smooth scroll with offset for nav links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offsetY = target.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: offsetY, behavior: 'smooth' });
      }
    });
  });

  if (!document.getElementById('reveal-style')) {
    const s = document.createElement('style');
    s.id = 'reveal-style';
    s.textContent = '';
    document.head.appendChild(s);
  }

  // ============================================================
  //  INIT — Async: open IndexedDB, migrate, load, render
  // ============================================================
  async function initApp() {
    try {
      await openDB();
    } catch (e) {
      console.warn('IndexedDB unavailable, falling back to localStorage-only mode');
    }

    // Migrate old localStorage data (with embedded media) to IndexedDB
    await migrateToIndexedDB();

    // Load metadata from localStorage
    works = loadWorksMeta();

    // If works have no src yet, load media from IndexedDB
    if (works.length > 0 && !works[0].src) {
      const mediaMap = await loadAllMedia();
      works.forEach(w => {
        if (mediaMap[w.id]) {
          w.src = mediaMap[w.id];
        }
      });
    }

    // Demo works — initialize if empty
    if (works.length === 0) {
      works = [...DEMO_WORKS];
      // Save demo media to IndexedDB
      const demoMedia = works.map(w => ({ id: w.id, src: w.src }));
      try { await saveMediaBatch(demoMedia); } catch(e) { /* SVGs are small, fine */ }
      saveWorksMeta(works);
    }

    renderSubcategories();
    renderGallery();
    buildHeroSlides();
    startSlideshow();
    resetIdleTimer();
    setupSectionReveals();
  }

  initApp();

})();
