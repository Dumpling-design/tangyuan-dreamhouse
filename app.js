/* ============================================================
   汤圆畅想屋 — v5 Application Logic
   Cloud-first architecture: Supabase DB + Storage
   All devices share the same gallery data.
   ============================================================ */

;(function () {
  'use strict';

  // ============================================================
  //  SUPABASE CLIENT
  // ============================================================
  const SUPABASE_URL = 'https://ijigiydtqtdchhokflqz.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqaWdpeWR0cXRkY2hob2tmbHF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDYwNTMsImV4cCI6MjA5MTgyMjA1M30.RyAhBcJl42ad3oOlU_mAtah_Dre5hSppL6KSwPM2WIk';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ============================================================
  //  ADMIN AUTHENTICATION SYSTEM
  // ============================================================
  let isAdminAuthenticated = false;

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

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

  let pendingAdminAction = null;
  checkAdminSession();

  // ============================================================
  //  CATEGORY SYSTEM — dynamic subcategories (cloud-persisted)
  // ============================================================
  const DEFAULT_SUBCATEGORIES = {
    photography: {
      landscape: '风光', portrait: '人像', street: '街拍',
      architecture: '建筑', product: '产品', nature: '自然',
      travel: '旅行', night: '夜景', macro: '微距',
      documentary: '纪实', other_photo: '其他',
    },
    painting: {
      concept_art: '概念艺术', illustration: '插画',
      digital_painting: '数字绘画', traditional: '传统绘画',
      sketch: '速写/素描', character: '角色设计',
      environment: '环境/场景', matte_painting: '数字景观',
      fanart: '同人创作', other_paint: '其他',
    },
    design: {
      interior: '室内设计', graphic: '平面设计',
      ui_ux: 'UI/UX', branding: '品牌设计',
      poster: '海报', packaging: '包装',
      motion: '动态设计', '3d': '3D 设计',
      typography: '字体设计', other_design: '其他',
    },
    video: {
      short_film: '短片', vlog: 'Vlog', music_video: 'MV',
      commercial: '商业广告', animation: '动画',
      documentary_film: '纪录片', showreel: 'Showreel',
      timelapse: '延时摄影', bts: '幕后花絮', other_video: '其他',
    }
  };

  const CATEGORIES = {
    photography: { label: '摄影', icon: 'camera', subcategories: {} },
    painting:    { label: '绘画', icon: 'palette', subcategories: {} },
    design:      { label: '设计', icon: 'layers', subcategories: {} },
    video:       { label: '视频', icon: 'video', subcategories: {} },
  };

  // Load custom subcategories from Supabase DB
  async function loadCustomSubcategories() {
    // Start with defaults
    for (const catKey of Object.keys(CATEGORIES)) {
      CATEGORIES[catKey].subcategories = { ...DEFAULT_SUBCATEGORIES[catKey] };
    }

    try {
      const { data, error } = await supabase
        .from('custom_subcategories')
        .select('*');

      if (error) {
        console.warn('Failed to load custom subcategories:', error);
        return;
      }

      if (data && data.length > 0) {
        for (const row of data) {
          if (!CATEGORIES[row.category]) continue;
          if (row.action === 'removed') {
            delete CATEGORIES[row.category].subcategories[row.sub_key];
          } else if (row.action === 'added') {
            CATEGORIES[row.category].subcategories[row.sub_key] = row.sub_label;
          }
        }
      }
    } catch (e) {
      console.warn('Error loading subcategories:', e);
    }
  }

  async function addSubcategory(catKey, subKey, subLabel) {
    if (!CATEGORIES[catKey]) return false;
    if (CATEGORIES[catKey].subcategories[subKey]) return false;
    CATEGORIES[catKey].subcategories[subKey] = subLabel;

    try {
      await supabase
        .from('custom_subcategories')
        .upsert({ category: catKey, sub_key: subKey, sub_label: subLabel, action: 'added' },
                 { onConflict: 'category,sub_key,action' });
    } catch (e) {
      console.error('Failed to save subcategory:', e);
    }
    return true;
  }

  async function removeSubcategory(catKey, subKey) {
    if (!CATEGORIES[catKey]) return false;
    if (!(subKey in CATEGORIES[catKey].subcategories)) return false;

    const isDefault = subKey in DEFAULT_SUBCATEGORIES[catKey];
    delete CATEGORIES[catKey].subcategories[subKey];

    try {
      if (isDefault) {
        // Mark default subcategory as removed
        await supabase
          .from('custom_subcategories')
          .upsert({ category: catKey, sub_key: subKey, sub_label: '', action: 'removed' },
                   { onConflict: 'category,sub_key,action' });
      } else {
        // Delete the custom addition
        await supabase
          .from('custom_subcategories')
          .delete()
          .eq('category', catKey)
          .eq('sub_key', subKey)
          .eq('action', 'added');
      }
    } catch (e) {
      console.error('Failed to remove subcategory:', e);
    }
    return true;
  }

  function getCategoryLabel(cat) { return CATEGORIES[cat]?.label || cat; }
  function getSubcategoryLabel(cat, sub) { return CATEGORIES[cat]?.subcategories?.[sub] || sub || ''; }
  function getSubcategories(cat) { return CATEGORIES[cat]?.subcategories || {}; }

  // ============================================================
  //  SUPABASE CLOUD DATA LAYER
  //  - Works metadata in `works` table
  //  - Media files in `artworks` storage bucket
  //  - Public URLs for images (no auth needed to view)
  // ============================================================

  // Load all works from Supabase DB
  async function loadWorksFromCloud() {
    try {
      const { data, error } = await supabase
        .from('works')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load works:', error);
        return [];
      }

      // Map DB rows to app format, generate public URLs for media
      return (data || []).map(row => ({
        id: row.id,
        title: row.title,
        category: row.category,
        subcategory: row.subcategory || '',
        mediaType: row.media_type || 'image',
        desc: row.description || '',
        storagePath: row.storage_path || '',
        src: row.storage_path
          ? `${SUPABASE_URL}/storage/v1/object/public/artworks/${row.storage_path}`
          : '',
        createdAt: row.created_at,
      }));
    } catch (e) {
      console.error('Error loading works:', e);
      return [];
    }
  }

  // Upload media file to Supabase Storage, return storage path
  async function uploadMediaToCloud(file, workId) {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const storagePath = `${workId}.${ext}`;

    const { error } = await supabase.storage
      .from('artworks')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      });

    if (error) {
      console.error('Storage upload failed:', error);
      throw error;
    }

    return storagePath;
  }

  // Upload base64 data (from compression) to Supabase Storage
  async function uploadBase64ToCloud(base64Data, workId, mimeType) {
    // Convert base64 to Blob
    const byteString = atob(base64Data.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeType || 'image/jpeg' });

    const ext = mimeType === 'video/mp4' ? 'mp4'
      : mimeType === 'video/webm' ? 'webm'
      : 'jpg';
    const storagePath = `${workId}.${ext}`;

    const { error } = await supabase.storage
      .from('artworks')
      .upload(storagePath, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: mimeType || 'image/jpeg',
      });

    if (error) {
      console.error('Storage upload failed:', error);
      throw error;
    }

    return storagePath;
  }

  // Save work metadata to Supabase DB
  async function saveWorkToCloud(work) {
    const { error } = await supabase
      .from('works')
      .upsert({
        id: work.id,
        title: work.title,
        category: work.category,
        subcategory: work.subcategory || '',
        media_type: work.mediaType || 'image',
        description: work.desc || '',
        storage_path: work.storagePath || '',
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to save work metadata:', error);
      throw error;
    }
  }

  // Delete work from cloud (DB + Storage)
  async function deleteWorkFromCloud(work) {
    // Delete from storage
    if (work.storagePath) {
      const { error: storageErr } = await supabase.storage
        .from('artworks')
        .remove([work.storagePath]);
      if (storageErr) console.warn('Storage delete warning:', storageErr);
    }

    // Delete from DB
    const { error: dbErr } = await supabase
      .from('works')
      .delete()
      .eq('id', work.id);

    if (dbErr) {
      console.error('Failed to delete work from DB:', dbErr);
      throw dbErr;
    }
  }

  // Update work metadata in cloud
  async function updateWorkInCloud(work) {
    const { error } = await supabase
      .from('works')
      .update({
        title: work.title,
        category: work.category,
        subcategory: work.subcategory || '',
        description: work.desc || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', work.id);

    if (error) {
      console.error('Failed to update work:', error);
      throw error;
    }
  }

  // ============================================================
  //  IMAGE COMPRESSION (still useful to reduce upload size)
  // ============================================================
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

        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.length < dataURL.length ? compressed : dataURL);
      };
      img.onerror = () => resolve(dataURL);
      img.src = dataURL;
    });
  }

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

    if (sectionActiveLight) {
      const isInsideContent = window.scrollY > window.innerHeight * 0.5;
      sectionActiveLight.classList.toggle('visible', isInsideContent);
    }
  }, { passive: true });

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
  let works = [];

  function updateStats() {
    const count = cat => works.filter(w => w.category === cat).length;
    animateNumber($('#statPhotos'), count('photography'));
    animateNumber($('#statPaintings'), count('painting'));
    animateNumber($('#statDesigns'), count('design'));
    animateNumber($('#statVideos'), count('video'));
  }

  function animateNumber(el, target) {
    if (!el) return;
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
  const SLIDE_DURATION = 6000;
  const SLIDE_TRANSITION = 1800;
  let heroSlides = [];
  let heroSlideIdx = 0;
  let heroTimer = null;
  let idleTimer = null;
  let isIdleAutoPlay = false;

  function getHeroWorks() {
    return works.filter(w => w.src);
  }

  function buildHeroSlides() {
    const heroWorks = getHeroWorks();
    if (heroWorks.length === 0) {
      if (heroSlideshow) heroSlideshow.innerHTML = '';
      if (heroIndicators) heroIndicators.innerHTML = '';
      heroSlides = [];
      return;
    }

    heroSlideshow.innerHTML = '';
    heroIndicators.innerHTML = '';
    heroSlides = [];

    heroWorks.forEach((w, i) => {
      const slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' active' : '');

      if (w.mediaType === 'video') {
        const video = document.createElement('video');
        video.src = w.src;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = (i === 0);
        video.crossOrigin = 'anonymous';
        slide.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = w.src;
        img.alt = w.title;
        img.loading = (i < 3) ? 'eager' : 'lazy';
        img.crossOrigin = 'anonymous';
        slide.appendChild(img);
      }

      heroSlideshow.appendChild(slide);
      heroSlides.push({ el: slide, work: w });

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

    const prevSlide = heroSlides[prevIdx];
    if (prevSlide) {
      prevSlide.el.classList.remove('active');
      prevSlide.el.classList.add('leaving');
      const prevVideo = prevSlide.el.querySelector('video');
      if (prevVideo) prevVideo.pause();
      setTimeout(() => prevSlide.el.classList.remove('leaving'), 2200);
    }

    heroSlideIdx = newIdx;
    const currentSlide = heroSlides[heroSlideIdx];

    heroSlides.forEach((s, i) => {
      if (i !== prevIdx) s.el.classList.remove('active', 'leaving');
    });
    currentSlide.el.classList.add('active');

    const currentVideo = currentSlide.el.querySelector('video');
    if (currentVideo) {
      currentVideo.currentTime = 0;
      currentVideo.play().catch(() => {});
    }

    const dots = heroIndicators.querySelectorAll('.slide-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === heroSlideIdx);
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
    if (slideCounter) slideCounter.textContent = `${num} / ${tot}`;
    if (slideTitle) slideTitle.textContent = heroSlides[idx]?.work?.title || '';
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

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!heroTimer && heroSlides.length > 1) {
        startSlideshow();
        isIdleAutoPlay = true;
      }
    }, 10000);
  }

  ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll'].forEach(evt => {
    document.addEventListener(evt, () => {
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
      const countHtml = count > 0 ? ` <span style="opacity:.5;font-size:10px">${count}</span>` : '';
      const delBtn = isAdminAuthenticated
        ? `<span class="sub-tag-del" data-cat="${currentCategory}" data-sub="${key}" title="删除子分类">&times;</span>`
        : '';
      html += `<button class="sub-tag" data-sub="${key}">${label}${countHtml}${delBtn}</button>`;
    }
    if (isAdminAuthenticated) {
      html += `<button class="sub-tag sub-tag-add" id="addSubcatBtn" title="添加子分类">+ 添加</button>`;
    }
    subcategoryBar.innerHTML = html;

    subcategoryBar.querySelectorAll('.sub-tag:not(.sub-tag-add)').forEach(tag => {
      tag.addEventListener('click', (e) => {
        if (e.target.classList.contains('sub-tag-del')) return;
        subcategoryBar.querySelectorAll('.sub-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        currentSubcategory = tag.dataset.sub;
        renderGallery();
      });
    });

    subcategoryBar.querySelectorAll('.sub-tag-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cat = btn.dataset.cat;
        const sub = btn.dataset.sub;
        const label = getSubcategoryLabel(cat, sub);
        const usedCount = works.filter(w => w.category === cat && w.subcategory === sub).length;
        let msg = `确定要删除子分类「${label}」吗？`;
        if (usedCount > 0) {
          msg += `\n\n⚠️ 当前有 ${usedCount} 件作品使用此子分类，删除后这些作品的子分类将显示为空。`;
        }
        if (!confirm(msg)) return;
        await removeSubcategory(cat, sub);
        renderSubcategories();
        if (uploadModal.classList.contains('open')) {
          populateSubcategorySelect('uploadSubcategory', $('#uploadCategory').value);
        }
        if (editModal.classList.contains('open')) {
          populateSubcategorySelect('editSubcategory', $('#editCategory').value);
        }
        showToast(`已删除子分类「${label}」`);
      });
    });

    const addBtn = document.getElementById('addSubcatBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => openAddSubcatModal(currentCategory));
    }
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
      ? `<video src="${w.src}" muted loop playsinline preload="metadata" crossorigin="anonymous"></video>`
      : `<img src="${w.src}" alt="${w.title}" loading="lazy" crossorigin="anonymous" />`;
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
      const vid = el.querySelector('video');
      if (vid) {
        el.addEventListener('mouseenter', () => vid.play().catch(() => {}));
        el.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
      }
    });
  }

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

  const adminModal     = $('#adminModal');
  const adminPassword  = $('#adminPassword');
  const adminError     = $('#adminError');
  const adminRemember  = $('#adminRemember');

  function openAdminModal(descText) {
    adminPassword.value = '';
    adminError.textContent = '';
    const descEl = adminModal.querySelector('.admin-modal-desc');
    if (descEl && descText) {
      descEl.textContent = descText;
    } else if (descEl) {
      descEl.textContent = '请输入管理员密码以继续操作';
    }
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
      renderSubcategories();
      if (pendingAdminAction) {
        const action = pendingAdminAction;
        pendingAdminAction = null;
        action();
      } else {
        openUploadModal();
      }
    } else {
      adminError.textContent = '密码错误，请重试';
      adminPassword.value = '';
      adminPassword.focus();
      adminModal.querySelector('.modal-content').style.animation = 'shake .4s ease';
      setTimeout(() => {
        adminModal.querySelector('.modal-content').style.animation = '';
      }, 400);
    }
  });

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

  function handleUploadClick() {
    if (isAdminAuthenticated) {
      openUploadModal();
    } else {
      pendingAdminAction = null;
      openAdminModal('请输入管理员密码以访问上传功能');
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

      if (file.size > 50 * 1024 * 1024) {
        showToast(`文件 ${file.name} 过大（>${Math.round(file.size/1024/1024)}MB），Supabase 免费版限制 50MB`);
        return;
      }

      // Store File object directly for cloud upload
      pendingFiles.push({
        name: file.name,
        file: file,
        type: isVideo ? 'video' : 'image',
        previewUrl: URL.createObjectURL(file),
      });

      if (isVideo) $('#uploadMediaType').value = 'video';
      renderPreviews();
    });
  }

  function renderPreviews() {
    const container = $('#uploadPreviews');
    container.innerHTML = pendingFiles.map((f, i) => {
      const mediaEl = f.type === 'video'
        ? `<video src="${f.previewUrl}" muted></video>`
        : `<img src="${f.previewUrl}" alt="" />`;
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
        URL.revokeObjectURL(pendingFiles[+btn.dataset.idx].previewUrl);
        pendingFiles.splice(+btn.dataset.idx, 1);
        renderPreviews();
      });
    });
  }

  // Submit upload — now uploads to Supabase
  $('#uploadSubmit').addEventListener('click', async () => {
    if (pendingFiles.length === 0) {
      showToast('请先选择文件');
      return;
    }

    const submitBtn = $('#uploadSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = '上传中…';

    const title = $('#uploadTitle').value.trim() || '未命名作品';
    const category = $('#uploadCategory').value;
    const subcategory = $('#uploadSubcategory').value;
    const mediaType = $('#uploadMediaType').value;
    const desc = $('#uploadDesc').value.trim();

    let uploadedCount = 0;

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const f = pendingFiles[i];
        const id = 'w' + Date.now() + '_' + i;
        const workTitle = pendingFiles.length === 1 ? title : `${title} (${i + 1})`;

        submitBtn.textContent = `上传中 (${i + 1}/${pendingFiles.length})…`;

        // Upload file to Supabase Storage
        let storagePath;
        if (f.type === 'image' && f.file.size > 2 * 1024 * 1024) {
          // Compress large images before upload
          const reader = new FileReader();
          const dataURL = await new Promise((resolve) => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(f.file);
          });
          const compressed = await compressImage(dataURL, 1920, 1920, 0.8);
          storagePath = await uploadBase64ToCloud(compressed, id, 'image/jpeg');
        } else {
          // Direct upload for small images and videos
          const ext = f.name.split('.').pop().toLowerCase() || (f.type === 'video' ? 'mp4' : 'jpg');
          storagePath = `${id}.${ext}`;
          const { error } = await supabase.storage
            .from('artworks')
            .upload(storagePath, f.file, {
              cacheControl: '3600',
              upsert: true,
              contentType: f.file.type,
            });
          if (error) throw error;
        }

        // Save metadata to DB
        const work = {
          id,
          title: workTitle,
          category,
          subcategory,
          mediaType: f.type || mediaType,
          desc,
          storagePath,
          src: `${SUPABASE_URL}/storage/v1/object/public/artworks/${storagePath}`,
        };

        await saveWorkToCloud(work);
        works.unshift(work);
        uploadedCount++;
      }

      // Clean up preview URLs
      pendingFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));

      renderSubcategories();
      renderGallery();
      buildHeroSlides();
      startSlideshow();
      closeUploadModal();
      showToast(`已上传 ${uploadedCount} 件作品 ✓`);

    } catch (e) {
      console.error('Upload failed:', e);
      showToast(`上传失败: ${e.message || '请重试'}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="btn-glow"></span>确认上传';
    }
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
      lbVideo.crossOrigin = 'anonymous';
      lbVideo.play().catch(() => {});
    } else {
      lbVideo.style.display = 'none';
      lbVideo.pause();
      lbImage.style.display = 'block';
      lbImage.src = w.src;
      lbImage.crossOrigin = 'anonymous';
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

  // Delete from lightbox — requires admin
  $('#lbDelete').addEventListener('click', async () => {
    const w = lbFiltered[lbIndex];
    if (!w) return;

    if (!isAdminAuthenticated) {
      pendingAdminAction = () => performDelete(w);
      closeLightbox();
      openAdminModal('请输入管理员密码以删除作品');
      return;
    }

    performDelete(w);
  });

  async function performDelete(work) {
    if (!confirm(`确定要删除「${work.title}」吗？`)) return;

    try {
      showToast('正在删除…');
      await deleteWorkFromCloud(work);
      works = works.filter(x => x.id !== work.id);
      closeLightbox();
      renderSubcategories();
      renderGallery();
      buildHeroSlides();
      startSlideshow();
      showToast('已删除 ✓');
    } catch (e) {
      console.error('Delete failed:', e);
      showToast('删除失败，请重试');
    }
  }

  // ============================================================
  //  WATERMARK DOWNLOAD
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
    ctx.drawImage(sourceEl, 0, 0, sourceWidth, sourceHeight);

    if (!isAdminAuthenticated) {
      const minDim = Math.min(sourceWidth, sourceHeight);
      const fontSize = Math.max(16, Math.round(minDim * 0.028));
      const padding = Math.round(fontSize * 0.8);

      ctx.save();
      ctx.font = `500 ${fontSize}px "Inter", "Space Grotesk", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      const text = 'tangyuan-dreamhouse';
      const x = sourceWidth - padding;
      const y = sourceHeight - padding;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = fontSize * 0.3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText(text, x, y);

      ctx.restore();
    }

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

  $('#lbDownload').addEventListener('click', () => {
    const w = lbFiltered[lbIndex];
    if (!w) return;

    const isVideo = w.mediaType === 'video';
    const filename = (w.title || 'tangyuan_work') + (isAdminAuthenticated && isVideo ? '.mp4' : '.png');

    if (isAdminAuthenticated && !isVideo) {
      // Admin: direct download original
      const a = document.createElement('a');
      a.href = w.src;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('已下载（原图）✓');
      return;
    }

    if (isAdminAuthenticated && isVideo) {
      const a = document.createElement('a');
      a.href = w.src;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('已下载（原视频）✓');
      return;
    }

    // Non-admin: add watermark
    if (isVideo) {
      const video = $('#lbVideo');
      if (video && video.readyState >= 2) {
        addWatermarkAndDownload(video, w.title + '_frame.png', true);
      } else {
        showToast('视频未加载完成，请稍后重试');
      }
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        addWatermarkAndDownload(img, filename, false);
      };
      img.onerror = () => {
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
    const w = lbFiltered[lbIndex];
    if (!w) return;

    if (!isAdminAuthenticated) {
      pendingAdminAction = () => openEditForWork(w);
      closeLightbox();
      openAdminModal('请输入管理员密码以编辑作品');
      return;
    }

    openEditForWork(w);
  });

  function openEditForWork(w) {
    editingId = w.id;
    $('#editTitle').value = w.title;
    $('#editCategory').value = w.category;
    populateSubcategorySelect('editSubcategory', w.category);
    $('#editSubcategory').value = w.subcategory || '';
    $('#editDesc').value = w.desc || '';
    closeLightbox();
    editModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeEditModal() {
    editModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  $('#editModalClose').addEventListener('click', closeEditModal);
  editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);

  $('#editSubmit').addEventListener('click', async () => {
    const idx = works.findIndex(w => w.id === editingId);
    if (idx < 0) return;

    const submitBtn = $('#editSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中…';

    works[idx].title = $('#editTitle').value.trim() || '未命名';
    works[idx].category = $('#editCategory').value;
    works[idx].subcategory = $('#editSubcategory').value;
    works[idx].desc = $('#editDesc').value.trim();

    try {
      await updateWorkInCloud(works[idx]);
      renderSubcategories();
      renderGallery();
      buildHeroSlides();
      closeEditModal();
      showToast('已保存修改 ✓');
    } catch (e) {
      console.error('Edit failed:', e);
      showToast('保存失败，请重试');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="btn-glow"></span>保存修改';
    }
  });

  // ============================================================
  //  ADD SUBCATEGORY MODAL
  // ============================================================
  const addSubcatModal = $('#addSubcatModal');
  let addSubcatTargetCat = '';

  function openAddSubcatModal(catKey) {
    addSubcatTargetCat = catKey;
    $('#addSubcatLabel').value = '';
    const titleEl = addSubcatModal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = `为「${getCategoryLabel(catKey)}」添加子分类`;
    addSubcatModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#addSubcatLabel').focus(), 300);
  }

  function closeAddSubcatModal() {
    addSubcatModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  $('#addSubcatClose').addEventListener('click', closeAddSubcatModal);
  addSubcatModal.querySelector('.modal-backdrop').addEventListener('click', closeAddSubcatModal);

  $('#addSubcatSubmit').addEventListener('click', async () => {
    const label = $('#addSubcatLabel').value.trim();
    if (!label) {
      showToast('请输入子分类名称');
      return;
    }
    const key = 'custom_' + Date.now().toString(36);
    const ok = await addSubcategory(addSubcatTargetCat, key, label);
    if (!ok) {
      showToast('添加失败，子分类可能已存在');
      return;
    }
    closeAddSubcatModal();
    renderSubcategories();
    if (uploadModal.classList.contains('open')) {
      populateSubcategorySelect('uploadSubcategory', $('#uploadCategory').value);
    }
    if (editModal.classList.contains('open')) {
      populateSubcategorySelect('editSubcategory', $('#editCategory').value);
    }
    showToast(`已添加子分类「${label}」✓`);
  });

  $('#addSubcatLabel').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#addSubcatSubmit').click();
  });

  // ============================================================
  //  ESCAPE KEY
  // ============================================================
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (addSubcatModal.classList.contains('open')) closeAddSubcatModal();
      else if (adminModal.classList.contains('open')) closeAdminModal();
      else if (editModal.classList.contains('open')) closeEditModal();
      else if (uploadModal.classList.contains('open')) closeUploadModal();
    }
  });

  // ============================================================
  //  SCROLL REVEAL
  // ============================================================
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        sectionObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

  const rowObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('row-revealed');
        rowObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  function setupSectionReveals() {
    document.querySelectorAll('.about-section, .contact-section').forEach(el => {
      el.classList.add('section-reveal');
      sectionObserver.observe(el);
    });
    document.querySelectorAll('.about-text > *, .contact-grid .contact-card').forEach(el => {
      el.classList.add('reveal-child');
    });
    document.querySelectorAll('.section-divider').forEach(el => {
      sectionObserver.observe(el);
    });
  }

  function observeGalleryRows() {
    document.querySelectorAll('.gallery-row').forEach((row, i) => {
      row.style.transitionDelay = `${i * 0.12}s`;
      rowObserver.observe(row);
    });
  }

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
  //  INIT — Async: load from Supabase cloud
  // ============================================================
  async function initApp() {
    try {
      // Load subcategories from cloud
      await loadCustomSubcategories();

      // Load works from Supabase DB
      works = await loadWorksFromCloud();
      console.log(`Loaded ${works.length} works from cloud`);

    } catch (e) {
      console.error('Failed to load from cloud:', e);
      showToast('加载数据失败，请刷新重试');
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
