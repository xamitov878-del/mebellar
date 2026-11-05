/* =========================================================
   MEBELCHI — asosiy dastur
   Tuzilishi:
   0. Sozlamalar va yordamchi funksiyalar
   1. SHA-256 (parolni xeshlash)
   2. Katalog: yuklash, filtr, chizish, o'chirish
   3. Galereya / slayder (mebel rasmlari)
   4. Admin: kirish, panel, parol ko'zchasi, parolni o'zgartirish
   5. Cloudinary'ga rasm yuklash (1–3 ta)
   6. Mebel qo'shish va tahrirlash (Firestore)
   7. Sahifa effektlari (menyu, skroll, animatsiya)
   8. Konsultatsiya formasi
   ========================================================= */

(function () {
  'use strict';

  /* ---------- 0. SOZLAMALAR VA YORDAMCHILAR ---------- */
  const CFG = window.MEBELCHI_CONFIG || {};
  const FB  = CFG.firebase   || {};
  const CLD = CFG.cloudinary || {};
  const TG  = CFG.telegramBot || {};

  const DEFAULT_PASSWORD = 'admin123';       // Firestore'da parol bo'lmaguncha shu ishlaydi
  const SESSION_KEY      = 'mebelchi_admin';
  const MAX_FILE_MB      = 10;               // Cloudinary bepul rejimida rasm limiti
  const MAX_IMAGES       = 3;                // bitta mebelga ko'pi bilan 3 ta rasm

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  document.documentElement.classList.add('js');

  // Element yaratish uchun qisqa yordamchi (textContent ishlatadi — XSS'dan himoya)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Firebase tayyormi?
  let db = null;
  if (FB.apiKey && FB.projectId && window.firebase) {
    try {
      firebase.initializeApp(FB);
      db = firebase.firestore();
    } catch (err) {
      console.error('Firebase ishga tushmadi:', err);
    }
  }
  const CLOUDINARY_READY = Boolean(CLD.cloudName && CLD.uploadPreset);
  const TELEGRAM_BOT_READY = Boolean(TG.token && TG.chatId);

  // Qisqa xabar (toast)
  const toastEl = $('#toast');
  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  // O'lcham: kenglik × uzunlik (eski hujjatlarda bitta `size` matni bo'lishi mumkin)
  function formatSize(product) {
    if (product.width && product.length) return `${product.width} × ${product.length} sm`;
    return product.size || '';
  }

  // Mebel rasmlari ro'yxati. Yangi hujjatlarda `images` massivi,
  // eski hujjatlarda bitta `imageUrl` bo'lishi mumkin — ikkalasi ham ishlaydi.
  function getImages(product) {
    if (Array.isArray(product.images) && product.images.length) return product.images;
    return product.imageUrl ? [product.imageUrl] : [];
  }

  // Sotuvchining shaxsiy Telegram profiliga havola (mebel nomi yozilgan tayyor xabar bilan; narx yo'q)
  function sellerLink(product) {
    const user = String(CFG.telegramUsername || '').replace('@', '').trim();
    if (!user) return '#';
    const text = product
      ? `Assalom alaykum! "${product.name}" (${product.category}, ${formatSize(product)}) mebeli haqida ma'lumot olmoqchiman.`
      : "Assalom alaykum! Mebelchi mebellari haqida ma'lumot olmoqchiman.";
    return `https://t.me/${user}?text=${encodeURIComponent(text)}`;
  }

  // Telegram guruhga havola (config.js dagi telegramGroup)
  function groupLink() {
    let link = String(CFG.telegramGroup || '').trim();
    if (!link) return '#';
    if (link.startsWith('@')) link = 'https://t.me/' + link.slice(1);
    else if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
    return link;
  }
  $('#heroContact').href = sellerLink(null);


  /* ---------- 1. SHA-256 ---------- */
  // Parol Firestore'da ochiq holda emas, xesh (SHA-256) ko'rinishida saqlanadi.
  async function sha256(text) {
    const input = 'mebelchi:' + text;
    if (window.crypto && window.crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Fallback(unescape(encodeURIComponent(input)));
  }

  // Zaxira: crypto.subtle bo'lmagan eski/xavfsiz bo'lmagan muhit uchun
  function sha256Fallback(ascii) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32);
    const k = [], hash = [];
    const words = [];
    const bitLength = ascii.length * 8;
    let primeCounter = 0, i, j, result = '';
    const isComposite = {};

    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++]  = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bitLength / maxWord) | 0;
    words[words.length] = bitLength;

    let h = hash.slice(0, 8);
    for (j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const old = h;
      h = h.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = h[0], e = h[4];
        const t1 = h[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & h[5]) ^ (~e & h[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] :
            (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(t1 + t2) | 0].concat(h);
        h[4] = (h[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) h[i] = (h[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (h[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }


  /* ---------- 2. KATALOG ---------- */
  const grid    = $('#products');
  const emptyEl = $('#empty');
  const notice  = $('#notice');

  let products  = [];
  let activeCat = 'all';
  let isAdmin   = false;

  // Firebase sozlanmaguncha saytning ko'rinishini ko'rsatish uchun namunalar
  const DEMO_PRODUCTS = [
    { id: 'd1', name: 'Milano burchak divani',    category: 'Mehmonxona', width: 260, length: 170,  description: "Yumshoq, chidamli mato. Burchak shaklidagi katta mehmonxonalar uchun." },
    { id: 'd2', name: 'Loft oshxona garniturasi', category: 'Oshxona',    width: 320, length: 60,  description: "Namlikka chidamli MDF, yumshoq yopiluvchi furnitura." },
    { id: 'd3', name: 'Royal ikki kishilik karavot', category: 'Yotoqxona', width: 200, length: 180, description: "Tabiiy yog'och karkas, yumshoq bosh qismi." },
    { id: 'd4', name: 'Executive direktor stoli', category: 'Ofis',       width: 200, length: 90,   description: "Keng ish yuzasi, kabellar uchun yashirin kanal." },
    { id: 'd5', name: 'Oslo kofe stoli',          category: 'Mehmonxona', width: 110, length: 60,   description: "" },
    { id: 'd6', name: 'Nord kiyim shkafi',        category: 'Yotoqxona',  width: 240, length: 60,  description: "" },
    { id: 'd7', name: 'Prime ofis kreslosi',      category: 'Ofis',       width: 65, length: 65,   description: "" },
    { id: 'd8', name: "Bar stoli to'plami",       category: 'Oshxona',    width: 120, length: 60,  description: "" }
  ];

  const PLACEHOLDER_CLASS = {
    Oshxona: 'placeholder--wood', Yotoqxona: 'placeholder--dark',
    Mehmonxona: 'placeholder--beige', Ofis: 'placeholder--gold'
  };

  function showNotice(message, type) {
    notice.textContent = message;
    notice.className = 'notice' + (type ? ' notice--' + type : '');
    notice.hidden = !message;
  }

  function createCard(product, index) {
    const images = getImages(product);
    const card = el('article', 'product');
    card.style.animationDelay = Math.min(index, 8) * 60 + 'ms';
    card.tabIndex = 0;

    // Rasm: kartochkada faqat 1-rasm (asosiy) ko'rinadi
    const media = el('div', 'product__media');
    const addPlaceholder = () => {
      media.replaceChildren(el('div', 'placeholder ' + (PLACEHOLDER_CLASS[product.category] || 'placeholder--wood'), '[ Rasm ]'));
      media.appendChild(el('span', 'product__cat', product.category));
    };
    if (images.length) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = product.name;
      img.src = images[0];
      img.addEventListener('error', addPlaceholder);
      media.appendChild(img);
      media.appendChild(el('span', 'product__cat', product.category));
      if (images.length > 1) media.appendChild(el('span', 'product__count', '📷 ' + images.length));
    } else {
      addPlaceholder();
    }

    // Ma'lumotlar
    const body = el('div', 'product__body');
    body.appendChild(el('h3', 'product__title', product.name));
    body.appendChild(el('p', 'product__size', "📐 O'lchami: " + formatSize(product)));
    if (product.description) body.appendChild(el('p', 'product__desc', product.description));

    // Narx o'rnida: sotuvchi bilan bog'lanish va guruhga qo'shilish
    const actions = el('div', 'product__actions');
    const contact = el('a', 'btn btn--gold btn--full', "Sotuvchi bilan bog'lanish");
    contact.href = sellerLink(product);
    const group = el('a', 'btn btn--outline btn--full', "Guruhga qo'shilish");
    group.href = groupLink();
    [contact, group].forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
    actions.append(contact, group);
    body.appendChild(actions);

    // Tahrirlash va O'chirish (faqat admin rejimida ko'rinadi — CSS orqali)
    const admin = el('div', 'product__admin');
    const edit = el('button', 'product__edit', 'Tahrirlash');
    edit.type = 'button';
    edit.addEventListener('click', () => startEdit(product));
    const del = el('button', 'product__delete', "O'chirish");
    del.type = 'button';
    del.addEventListener('click', () => deleteProduct(product.id, del));
    admin.append(edit, del);
    body.appendChild(admin);

    card.append(media, body);

    // Kartochkaga (rasm yoki matn ustiga) bosilsa galereya ochiladi.
    // Ichidagi tugma va havolalar o'z ishini qiladi.
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      openGallery(product);
    });
    card.addEventListener('keydown', (e) => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openGallery(product); }
    });
    return card;
  }

  function renderProducts() {
    const list = activeCat === 'all' ? products : products.filter(p => p.category === activeCat);
    grid.replaceChildren(...list.map(createCard));
    emptyEl.hidden = list.length > 0;
  }

  async function loadProducts() {
    if (!db) {
      products = DEMO_PRODUCTS;
      showNotice("Demo rejim: Firebase hali ulanmagan. js/config.js faylini to'ldiring — shunda haqiqiy ma'lumotlar yuklanadi.", 'info');
      renderProducts();
      return;
    }
    showNotice('Katalog yuklanmoqda...', 'info');
    try {
      const snap = await db.collection('products').orderBy('createdAt', 'desc').get();
      products = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
      showNotice('');
    } catch (err) {
      console.error(err);
      products = [];
      showNotice("Katalogni yuklab bo'lmadi. Firestore sozlamalari va qoidalarini tekshiring.", 'error');
    }
    renderProducts();
  }

  // Kategoriya filtri
  $$('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter').forEach(b => b.classList.toggle('active', b === btn));
      activeCat = btn.dataset.cat;
      renderProducts();
    });
  });

  // O'chirish: bazadan (delete) ham, sahifadan ham darhol
  async function deleteProduct(id, button) {
    if (!isAdmin) return;
    if (!confirm("Ushbu mebelni o'chirishni xohlaysizmi?")) return;
    button.disabled = true;
    try {
      await db.collection('products').doc(id).delete();
      products = products.filter(p => p.id !== id);
      if (editingId === id) resetProductForm();
      renderProducts();
      toast("Mebel o'chirildi");
    } catch (err) {
      console.error(err);
      button.disabled = false;
      toast("O'chirib bo'lmadi. Firestore qoidalarini tekshiring.");
    }
  }


  /* ---------- Modal oynalar (umumiy) ---------- */
  const loginModal   = $('#loginModal');
  const panelModal   = $('#panelModal');
  const galleryModal = $('#galleryModal');
  const adminBar     = $('#adminBar');

  function openModal(modal) {
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }
  function closeModal(modal) {
    modal.hidden = true;
    resetPasswordToggles();
    if ($$('.modal').every(m => m.hidden)) document.body.classList.remove('modal-open');
  }
  $$('.modal').forEach(modal => {
    $$('[data-close]', modal).forEach(node => node.addEventListener('click', () => closeModal(modal)));
  });


  /* ---------- 3. GALEREYA / SLAYDER ---------- */
  const sliderEl     = $('#slider');
  const sliderTrack  = $('#sliderTrack');
  const sliderPrev   = $('#sliderPrev');
  const sliderNext   = $('#sliderNext');
  const sliderCount  = $('#sliderCounter');
  const sliderThumbs = $('#sliderThumbs');
  let gallery = { total: 0, index: 0 };

  function goToSlide(index) {
    if (!gallery.total) return;
    gallery.index = (index + gallery.total) % gallery.total;       // aylanma
    sliderTrack.style.transform = `translateX(-${gallery.index * 100}%)`;
    sliderCount.textContent = `${gallery.index + 1} / ${gallery.total}`;
    $$('.slider__thumb', sliderThumbs).forEach((t, i) => t.classList.toggle('active', i === gallery.index));
  }

  function openGallery(product) {
    const images = getImages(product);
    gallery = { total: Math.max(images.length, 1), index: 0 };

    // Slaydlar
    sliderTrack.replaceChildren();
    if (images.length) {
      images.forEach((url, i) => {
        const slide = el('div', 'slider__slide');
        const img = document.createElement('img');
        img.src = url;
        img.alt = `${product.name} — ${i + 1}-rasm`;
        slide.appendChild(img);
        sliderTrack.appendChild(slide);
      });
    } else {
      const slide = el('div', 'slider__slide');
      slide.appendChild(el('div', 'placeholder ' + (PLACEHOLDER_CLASS[product.category] || 'placeholder--wood'), '[ Rasm ]'));
      sliderTrack.appendChild(slide);
    }

    // Kichik rasmlar (faqat 2 va undan ko'p rasm bo'lsa)
    sliderThumbs.replaceChildren();
    if (images.length > 1) {
      images.forEach((url, i) => {
        const btn = el('button', 'slider__thumb');
        btn.type = 'button';
        btn.setAttribute('aria-label', `${i + 1}-rasmni ko'rish`);
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        btn.appendChild(img);
        btn.addEventListener('click', () => goToSlide(i));
        sliderThumbs.appendChild(btn);
      });
    }
    const many = images.length > 1;
    sliderPrev.hidden = sliderNext.hidden = sliderCount.hidden = !many;

    // Ma'lumotlar
    $('#galleryCat').textContent   = product.category;
    $('#galleryTitle').textContent = product.name;
    $('#gallerySize').textContent  = "📐 O'lchami: " + formatSize(product);
    $('#galleryDesc').textContent  = product.description || '';
    $('#galleryContact').href = sellerLink(product);
    $('#galleryGroup').href   = groupLink();

    sliderTrack.style.transition = 'none';
    goToSlide(0);
    void sliderTrack.offsetWidth;            // transitionni qayta yoqishdan oldin yangilash
    sliderTrack.style.transition = '';
    openModal(galleryModal);
  }

  sliderPrev.addEventListener('click', () => goToSlide(gallery.index - 1));
  sliderNext.addEventListener('click', () => goToSlide(gallery.index + 1));

  // Telefonda barmoq bilan surish
  let touchStartX = null;
  sliderEl.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  sliderEl.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) > 40) goToSlide(gallery.index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // Klaviatura: Esc — yopish, ← → — rasmlarni almashtirish
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $$('.modal').forEach(closeModal); return; }
    if (galleryModal.hidden) return;
    if (e.key === 'ArrowLeft')  goToSlide(gallery.index - 1);
    if (e.key === 'ArrowRight') goToSlide(gallery.index + 1);
  });


  /* ---------- 4. ADMIN ---------- */
  function setAdmin(on) {
    isAdmin = on;
    document.body.classList.toggle('is-admin', on);
    adminBar.hidden = !on;
    try { on ? sessionStorage.setItem(SESSION_KEY, '1') : sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  // Parolni ko'rsatish / yashirish (ko'zcha tugmasi)
  function setPasswordVisible(btn, visible) {
    const input = $('input', btn.parentElement);
    input.type = visible ? 'text' : 'password';
    btn.classList.toggle('is-visible', visible);
    btn.setAttribute('aria-pressed', String(visible));
    btn.setAttribute('aria-label', visible ? 'Parolni yashirish' : "Parolni ko'rsatish");
  }
  function resetPasswordToggles() {
    $$('[data-toggle-password]').forEach(btn => setPasswordVisible(btn, false));
  }
  $$('[data-toggle-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      setPasswordVisible(btn, !btn.classList.contains('is-visible'));
      $('input', btn.parentElement).focus();
    });
  });

  // Yashirin "Admin" tugmasi (footer)
  $('#adminTrigger').addEventListener('click', () => {
    if (isAdmin) { openModal(panelModal); return; }
    $('#loginError').textContent = '';
    $('#loginForm').reset();
    resetPasswordToggles();
    openModal(loginModal);
    setTimeout(() => $('#loginPassword').focus(), 50);
  });
  $('#openPanel').addEventListener('click', () => openModal(panelModal));
  $('#logoutBtn').addEventListener('click', () => {
    setAdmin(false);
    resetProductForm();
    closeModal(panelModal);
    toast('Admin rejimidan chiqdingiz');
  });

  // Firestore'dagi joriy parol xeshi (hali o'zgartirilmagan bo'lsa — standart parol)
  async function getPasswordHash() {
    const snap = await db.collection('settings').doc('admin').get();
    if (snap.exists && snap.data().passwordHash) return snap.data().passwordHash;
    return sha256(DEFAULT_PASSWORD);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#loginError');
    const btn = $('#loginBtn');
    errorEl.textContent = '';

    if (!db) {
      errorEl.textContent = "Firebase ulanmagan. Avval js/config.js ni to'ldiring.";
      return;
    }
    const password = $('#loginPassword').value;
    if (!password) { errorEl.textContent = 'Parolni kiriting'; return; }

    btn.disabled = true;
    btn.textContent = 'Tekshirilmoqda...';
    try {
      const [saved, entered] = await Promise.all([getPasswordHash(), sha256(password)]);
      if (saved === entered) {
        setAdmin(true);
        closeModal(loginModal);
        openModal(panelModal);
        toast('Xush kelibsiz, admin!');
      } else {
        errorEl.textContent = "Parol noto'g'ri";
      }
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Bazaga ulanib bo'lmadi. Internet va Firestore qoidalarini tekshiring.";
    } finally {
      btn.disabled = false;
      btn.textContent = 'Kirish';
    }
  });

  // Panel tablari
  function showTab(tabId) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
  }
  $$('.tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

  // Parolni o'zgartirish
  $('#passForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#passError');
    const btn = $('#passBtn');
    const oldPass  = $('#oldPass').value;
    const newPass  = $('#newPass').value;
    const newPass2 = $('#newPass2').value;
    errorEl.textContent = '';

    if (!oldPass || !newPass || !newPass2) { errorEl.textContent = "Barcha maydonlarni to'ldiring"; return; }
    if (newPass.length < 6)    { errorEl.textContent = "Yangi parol kamida 6 belgi bo'lsin"; return; }
    if (newPass !== newPass2)  { errorEl.textContent = 'Yangi parollar bir-biriga mos emas'; return; }
    if (newPass === oldPass)   { errorEl.textContent = 'Yangi parol eskisidan farq qilsin'; return; }

    btn.disabled = true;
    btn.textContent = 'Saqlanmoqda...';
    try {
      const [saved, entered] = await Promise.all([getPasswordHash(), sha256(oldPass)]);
      if (saved !== entered) { errorEl.textContent = "Joriy parol noto'g'ri"; return; }

      const newHash = await sha256(newPass);
      await db.collection('settings').doc('admin').set({ passwordHash: newHash, updatedAt: Date.now() }, { merge: true });
      $('#passForm').reset();
      resetPasswordToggles();
      toast("Parol muvaffaqiyatli o'zgartirildi");
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Parolni saqlab bo'lmadi. Internetni tekshiring.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Parolni o'zgartirish";
    }
  });


  /* ---------- 5. CLOUDINARY'GA RASM YUKLASH (1–3 ta) ---------- */
  const fileInput  = $('#pFile');
  const thumbsEl   = $('#thumbs');
  const hintEl     = $('#imagesHint');
  const productBtn = $('#productBtn');

  // Formadagi rasmlar. Har bir element:
  // { id, url, preview, status: 'uploading' | 'done' | 'error', percent, message, barEl }
  // Birinchi element — asosiy rasm.
  let formImages = [];

  const uid = () => Math.random().toString(36).slice(2, 10);

  function uploadToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
      const data = new FormData();
      data.append('file', file);
      data.append('upload_preset', CLD.uploadPreset);
      if (CLD.folder) data.append('folder', CLD.folder);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLD.cloudName)}/image/upload`);
      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      });
      xhr.addEventListener('load', () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) resolve(res.secure_url);
          else reject(new Error((res.error && res.error.message) || 'Yuklashda xatolik'));
        } catch (err) { reject(err); }
      });
      xhr.addEventListener('error', () => reject(new Error('Tarmoq xatosi')));
      xhr.send(data);
    });
  }

  function updateSubmitState() {
    const count     = formImages.length;
    const uploading = formImages.some(i => i.status === 'uploading');
    const hasError  = formImages.some(i => i.status === 'error');

    productBtn.disabled = !(count >= 1 && !uploading && !hasError);
    fileInput.disabled  = count >= MAX_IMAGES;

    if (!count)          hintEl.textContent = `Kamida 1 ta, ko'pi bilan ${MAX_IMAGES} ta rasm tanlang. Birinchi rasm — asosiy. Har biri ${MAX_FILE_MB} MB gacha.`;
    else if (uploading)  hintEl.textContent = 'Rasmlar yuklanmoqda...';
    else if (hasError)   hintEl.textContent = "Xatolik bo'lgan rasmni × bilan olib tashlang va qaytadan tanlang.";
    else                 hintEl.textContent = `${count} ta rasm tayyor` + (count < MAX_IMAGES ? `, yana ${MAX_IMAGES - count} ta qo'shishingiz mumkin.` : '.');
  }

  function renderThumbs() {
    thumbsEl.replaceChildren(...formImages.map((item, index) => {
      const thumb = el('div', `thumb thumb--${item.status}` + (index === 0 ? ' thumb--main' : ''));

      const img = document.createElement('img');
      img.src = item.preview;
      img.alt = `${index + 1}-rasm`;
      thumb.appendChild(img);

      if (index === 0) thumb.appendChild(el('span', 'thumb__badge', 'Asosiy'));

      const remove = el('button', 'thumb__remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Rasmni olib tashlash');
      remove.addEventListener('click', () => removeImage(item.id));
      thumb.appendChild(remove);

      if (item.status === 'done' && index > 0) {
        const main = el('button', 'thumb__main-btn', 'Asosiy qilish');
        main.type = 'button';
        main.addEventListener('click', () => makeMainImage(item.id));
        thumb.appendChild(main);
      }
      if (item.status === 'uploading') {
        const bar = el('div', 'thumb__progress');
        item.barEl = el('span');
        item.barEl.style.width = item.percent + '%';
        bar.appendChild(item.barEl);
        thumb.appendChild(bar);
      }
      if (item.status === 'error') thumb.appendChild(el('div', 'thumb__msg', item.message || 'Xatolik'));
      return thumb;
    }));
    updateSubmitState();
  }

  function removeImage(id) {
    const item = formImages.find(i => i.id === id);
    if (item && item.file) URL.revokeObjectURL(item.preview);
    formImages = formImages.filter(i => i.id !== id);
    renderThumbs();
  }

  function makeMainImage(id) {
    const item = formImages.find(i => i.id === id);
    if (!item) return;
    formImages = [item, ...formImages.filter(i => i.id !== id)];
    renderThumbs();
  }

  function addImageFile(file) {
    if (!file.type.startsWith('image/')) { toast(`"${file.name}" rasm emas`); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast(`"${file.name}" ${MAX_FILE_MB} MB dan katta`); return; }

    const item = { id: uid(), file, url: '', preview: URL.createObjectURL(file), status: 'uploading', percent: 0 };
    formImages.push(item);
    renderThumbs();

    if (!CLOUDINARY_READY) {
      item.status = 'error';
      item.message = 'Cloudinary sozlanmagan (js/config.js)';
      renderThumbs();
      return;
    }

    uploadToCloudinary(file, (percent) => {
      item.percent = percent;
      if (item.barEl) item.barEl.style.width = percent + '%';
    }).then((url) => {
      item.url = url;
      item.status = 'done';
    }).catch((err) => {
      console.error(err);
      item.status = 'error';
      item.message = err.message;
    }).finally(() => {
      if (formImages.includes(item)) renderThumbs();     // olib tashlangan bo'lsa — hech narsa qilmaymiz
    });
  }

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    fileInput.value = '';                                   // xuddi shu faylni qayta tanlash mumkin bo'lsin
    const free = MAX_IMAGES - formImages.length;
    if (free <= 0) { toast(`Ko'pi bilan ${MAX_IMAGES} ta rasm qo'shish mumkin`); return; }
    if (files.length > free) toast(`Faqat ${free} ta rasm qo'shildi (maksimum ${MAX_IMAGES})`);
    files.slice(0, free).forEach(addImageFile);
  });


  /* ---------- 6. MEBEL QO'SHISH VA TAHRIRLASH ---------- */
  const productForm = $('#productForm');
  const cancelEdit  = $('#cancelEditBtn');
  let editingId = null;                                     // null — yangi mebel qo'shilyapti

  function setEditUI(on, name) {
    $('#editBanner').hidden = !on;
    $('#editName').textContent = on ? name : '';
    cancelEdit.hidden = !on;
    productBtn.textContent = on ? "O'zgarishlarni saqlash" : 'Mebelni saqlash';
    $('#addTabBtn').textContent = on ? 'Tahrirlash' : "Mebel qo'shish";
    $('#panelTitle').textContent = on ? 'Mebelni tahrirlash' : 'Admin panel';
  }

  function resetProductForm() {
    productForm.reset();
    formImages.forEach(i => { if (i.file) URL.revokeObjectURL(i.preview); });
    formImages = [];
    editingId = null;
    $('#productError').textContent = '';
    setEditUI(false);
    renderThumbs();
  }

  // Tahrirlash: mebel ma'lumotlari va rasmlari formaga avtomatik yuklanadi
  function startEdit(product) {
    if (!isAdmin) return;
    resetProductForm();
    editingId = product.id;

    $('#pName').value     = product.name || '';
    $('#pCategory').value = product.category || 'Oshxona';
    $('#pWidth').value    = product.width || '';
    $('#pLength').value   = product.length || '';
    $('#pDesc').value     = product.description || '';

    formImages = getImages(product).slice(0, MAX_IMAGES).map(url => (
      { id: uid(), file: null, url, preview: url, status: 'done', percent: 100 }
    ));
    setEditUI(true, product.name);
    renderThumbs();
    showTab('addTab');
    openModal(panelModal);
  }

  cancelEdit.addEventListener('click', () => { resetProductForm(); toast('Tahrirlash bekor qilindi'); });

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = $('#productError');
    errorEl.textContent = '';
    if (!isAdmin || !db) return;

    const data = {
      name:        $('#pName').value.trim(),
      category:    $('#pCategory').value,
      width:       Number($('#pWidth').value),
      length:      Number($('#pLength').value),
      description: $('#pDesc').value.trim(),
      images:      formImages.map(i => i.url)               // [url1, url2, url3]
    };

    if (data.name.length < 2 || !(data.width > 0) || !(data.length > 0)) {
      errorEl.textContent = "Nom, kenglik va uzunlikni to'g'ri kiriting";
      return;
    }
    if (!data.images.length) { errorEl.textContent = 'Kamida 1 ta rasm tanlang'; return; }

    const wasEditing = Boolean(editingId);
    productBtn.disabled = true;
    productBtn.textContent = 'Saqlanmoqda...';
    try {
      if (wasEditing) {
        // Mavjud hujjatni yangilash (updateDoc)
        const changes = Object.assign({}, data, { updatedAt: Date.now() });
        await db.collection('products').doc(editingId).update(changes);
        const existing = products.find(p => p.id === editingId);
        if (existing) Object.assign(existing, changes);
        toast("O'zgarishlar saqlandi");
      } else {
        const product = Object.assign({}, data, { createdAt: Date.now() });
        const ref = await db.collection('products').add(product);
        products.unshift(Object.assign({ id: ref.id }, product));
        toast("Mebel qo'shildi");
      }
      renderProducts();
      resetProductForm();
      if (wasEditing) closeModal(panelModal);
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Saqlab bo'lmadi. Firestore qoidalarini tekshiring.";
      setEditUI(wasEditing, $('#pName').value.trim());
      updateSubmitState();
    }
  });


  /* ---------- 7. SAHIFA EFFEKTLARI ---------- */
  // Mobil menyu
  const burger = $('#burger');
  const nav    = $('#nav');
  function toggleMenu(forceClose) {
    const open = forceClose ? false : !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  burger.addEventListener('click', () => toggleMenu());
  $$('a', nav).forEach(a => a.addEventListener('click', () => toggleMenu(true)));

  // Header soyasi
  const header = $('#header');
  const onScroll = () => header.classList.toggle('header--scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Aktiv menyu havolasi
  const navLinks = $$('.nav__link');
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach(s => sectionObserver.observe(s));

  // Skroll qilganda paydo bo'lish
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); obs.unobserve(entry.target); }
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(node => revealObserver.observe(node));


  /* ---------- 8. KONSULTATSIYA FORMASI ---------- */
  const leadForm   = $('#consultation-form');
  const nameInput  = $('#name');
  const phoneInput = $('#phone');

  function formatPhone(value) {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('998')) digits = digits.slice(3);
    digits = digits.slice(0, 9);
    let out = '+998';
    if (digits.length > 0) out += ' ' + digits.slice(0, 2);
    if (digits.length > 2) out += ' ' + digits.slice(2, 5);
    if (digits.length > 5) out += ' ' + digits.slice(5, 7);
    if (digits.length > 7) out += ' ' + digits.slice(7, 9);
    return out;
  }
  phoneInput.addEventListener('focus', () => { if (!phoneInput.value) phoneInput.value = '+998 '; });
  phoneInput.addEventListener('input', () => { phoneInput.value = formatPhone(phoneInput.value); });
  phoneInput.addEventListener('blur',  () => { if (phoneInput.value.trim() === '+998') phoneInput.value = ''; });

  function setFieldError(input, message) {
    $(`[data-error-for="${input.id}"]`, leadForm).textContent = message;
    input.classList.toggle('invalid', Boolean(message));
  }
  [nameInput, phoneInput].forEach(input => input.addEventListener('input', () => setFieldError(input, '')));

  // Joriy sana va vaqt (Toshkent vaqti bo'yicha): { date: '31.10.2026', time: '14:08' }
  function currentDateTime() {
    const pad = (n) => String(n).padStart(2, '0');
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      const get = (type) => parts.find(p => p.type === type).value;
      const hour = get('hour') === '24' ? '00' : get('hour');
      return { date: `${get('day')}.${get('month')}.${get('year')}`, time: `${hour}:${get('minute')}` };
    } catch (err) {
      const d = new Date();                                  // zaxira: qurilma vaqti
      return { date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }
  }

  // So'rovni Telegram botga yuborish
  async function sendLeadToTelegram(lead) {
    const { date, time } = currentDateTime();
    const text = [
      "📥 Yangi konsultatsiya so'rovi!",
      '',
      `👤 Ism: ${lead.name}`,
      `📞 Tel: ${lead.phone}`,
      `📅 Sana: ${date}`,
      `⏰ Vaqt: ${time}`
    ].join('\n');

    const response = await fetch(`https://api.telegram.org/bot${TG.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG.chatId, text })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.description || "Telegramga yuborib bo'lmadi");
  }

  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let valid = true;
    if (nameInput.value.trim().length < 2) { setFieldError(nameInput, 'Iltimos, ismingizni kiriting'); valid = false; }
    if (phoneInput.value.replace(/\D/g, '').length !== 12) { setFieldError(phoneInput, "Telefon raqamni to'liq kiriting"); valid = false; }
    if (!valid) return;

    const btn = $('#submitBtn');
    const msg = $('#formSuccess');
    btn.disabled = true;
    btn.textContent = 'Yuborilmoqda...';
    try {
      const lead = { name: nameInput.value.trim(), phone: phoneInput.value.trim(), createdAt: Date.now() };

      // So'rov Telegram botga yuboriladi va (Firebase ulangan bo'lsa) bazaga ham yoziladi
      const tasks = [];
      if (TELEGRAM_BOT_READY) tasks.push(sendLeadToTelegram(lead));
      if (db) tasks.push(db.collection('leads').add(lead));

      if (!tasks.length) {
        console.log("Demo rejim — yangi so'rov:", lead);
        msg.textContent = "Demo rejim: sozlamalar (js/config.js) to'ldirilmagani uchun so'rov hech qayerga yuborilmadi.";
      } else {
        const results = await Promise.allSettled(tasks);
        results.forEach(r => { if (r.status === 'rejected') console.error(r.reason); });
        if (results.some(r => r.status === 'fulfilled')) {
          msg.textContent = "Rahmat! Tez orada siz bilan bog'lanamiz.";
          leadForm.reset();
        } else {
          msg.textContent = "Xatolik yuz berdi. Iltimos, telefon orqali bog'laning.";
        }
      }
    } catch (err) {
      console.error(err);
      msg.textContent = "Xatolik yuz berdi. Iltimos, telefon orqali bog'laning.";
    } finally {
      msg.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Bepul konsultatsiya olish';
    }
  });


  /* ---------- ISHGA TUSHIRISH ---------- */
  try { if (db && sessionStorage.getItem(SESSION_KEY) === '1') setAdmin(true); } catch (e) { /* ignore */ }
  renderThumbs();          // forma holatini (maslahat matni, tugma) boshlang'ich holatga keltirish
  loadProducts();

})();
