(() => {
  'use strict';
  const config = window.BIKE_MASTERS_CONFIG;
  const ui = {
    grid: document.querySelector('#bikes-grid'), modal: document.querySelector('#admin-modal'),
    login: document.querySelector('#login-panel'), dashboard: document.querySelector('#dashboard-panel'),
    status: document.querySelector('#admin-status'), products: document.querySelector('#admin-products'),
    form: document.querySelector('#product-form'), save: document.querySelector('#save-product'),
    cancel: document.querySelector('#cancel-edit')
  };
  if (!config || !window.supabase) { ui.grid.innerHTML = '<p class="catalog-message">Catalog setup is unavailable. Please refresh the page.</p>'; return; }
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  let products = [], isAdmin = false, activeCategory = 'all';
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = n => new Intl.NumberFormat('en-EG').format(Number(n || 0)) + ' EGP';
  const availability = p => p.status === 'available' && Number(p.quantity) > 0;
  const specs = p => Array.isArray(p.specs) ? p.specs : [];
  const showStatus = (text, bad = false) => { ui.status.textContent = text; ui.status.classList.toggle('is-error', bad); };
  function renderCatalog() {
    const categoryNames = { road: 'Road bikes', mountain: 'Mountain bikes', kids: 'Kids bikes' };
    const filteredProducts = activeCategory === 'all' ? products : products.filter(p => p.category === activeCategory);
    document.querySelector('#catalog-eyebrow').textContent = activeCategory === 'all' ? 'Currently in the shop' : `Currently in the shop · ${categoryNames[activeCategory]}`;
    document.querySelector('#catalog-title').textContent = activeCategory === 'all' ? 'Bikes on the floor' : categoryNames[activeCategory];
    if (!filteredProducts.length) { ui.grid.innerHTML = `<p class="catalog-message">No ${activeCategory === 'all' ? '' : categoryNames[activeCategory].toLowerCase() + ' '}are listed right now. <button type="button" class="catalog-reset">Show all bikes</button></p>`; return; }
    ui.grid.innerHTML = filteredProducts.map(p => {
      const inStock = availability(p);
      const rows = specs(p).slice(0, 6).map(s => `<li><span>${esc(s.label)}</span><span>${esc(s.value)}</span></li>`).join('');
      const message = encodeURIComponent(`Hi Bike Masters, I’d like to ask about ${p.name}.`);
      return `<article class="ticket${inStock ? '' : ' ticket--sold-out'}">
        <a class="ticket-link" href="bike.html?id=${encodeURIComponent(p.id)}" aria-label="View ${esc(p.name)}">
        <div class="ticket-photo"><img src="${esc(p.image_url || 'assets/images/image-01.jpg')}" alt="${esc(p.name)}" loading="lazy">
        ${inStock && p.badge ? `<span class="ticket-badge">${esc(p.badge)}</span>` : ''}${inStock ? `<span class="ticket-price">${money(p.price)}</span>` : ''}</div>
        ${Array.isArray(p.gallery_urls) && p.gallery_urls.length ? `<div class="product-gallery">${p.gallery_urls.slice(0, 6).map(url => `<img src="${esc(url)}" alt="${esc(p.name)} additional view" loading="lazy">`).join('')}</div>` : ''}
        <div class="ticket-body"><h3>${esc(p.name)}</h3><div class="ticket-sub">${esc(p.subtitle || (inStock ? `${p.quantity} IN STOCK` : 'SOLD OUT'))}</div><div class="ticket-perf"></div>
        <ul class="spec-list">${rows || '<li><span>Stock</span><span>Contact shop for details</span></li>'}</ul>
        <div class="ticket-cta">${inStock ? `<span class="btn btn-ghost" style="width:100%; justify-content:center;">View bike details</span>` : ''}</div></div></a></article>`;
    }).join('');
  }
  async function loadProducts() {
    const { data, error } = await db.from('products').select('*').order('created_at', { ascending: false });
    if (error) { ui.grid.innerHTML = '<p class="catalog-message">The catalog is temporarily unavailable.</p>'; console.error(error); return; }
    products = data || []; renderCatalog(); renderAdminProducts();
  }
  async function checkAdmin() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { isAdmin = false; return false; }
    // This security-definer function is evaluated inside PostgreSQL with auth.uid().
    // It avoids exposing the admins table to the browser beyond what is necessary.
    const { data, error } = await db.rpc('is_admin');
    isAdmin = data === true && !error;
    return isAdmin;
  }
  function openAdmin() {
    ui.modal.hidden = false; document.body.classList.add('admin-open');
    checkAdmin().then(admin => { ui.login.hidden = admin; ui.dashboard.hidden = !admin; if (admin) { renderAdminProducts(); } else { document.querySelector('#login-email').focus(); } });
  }
  function closeAdmin() { ui.modal.hidden = true; document.body.classList.remove('admin-open'); showStatus(''); }
  async function uploadPhoto(file) {
    if (!file) return null;
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
    const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from('product-images').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
    if (error) throw error;
    return db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }
  function productPayload() {
    const rawSpecs = document.querySelector('#product-specs').value.split('\n').map(line => line.trim()).filter(Boolean);
    return {
      name: document.querySelector('#product-name').value.trim(), price: Number(document.querySelector('#product-price').value),
      badge: document.querySelector('#product-badge').value.trim() || null,
      subtitle: document.querySelector('#product-subtitle').value.trim() || null, category: document.querySelector('#product-category').value, quantity: Number(document.querySelector('#product-quantity').value),
      status: document.querySelector('#product-status').value,
      specs: rawSpecs.map(line => { const [label, ...rest] = line.split(':'); return { label: label.trim(), value: rest.join(':').trim() || '—' }; })
    };
  }
  function resetForm() { ui.form.reset(); document.querySelector('#product-id').value = ''; document.querySelector('#product-image-file').required = true; document.querySelector('#product-quantity').value = '1'; ui.save.textContent = 'Add product'; ui.cancel.hidden = true; }
  function renderAdminProducts() {
    if (!isAdmin) return;
    ui.products.innerHTML = products.length ? products.map(p => `<div class="admin-product"><div><strong>${esc(p.name)}</strong><span>${availability(p) ? `Available · ${p.quantity} in stock` : 'Sold out'} · ${money(p.price)}</span></div><div><button class="btn btn-ghost" type="button" data-edit="${p.id}">Edit</button><button class="btn btn-danger" type="button" data-delete="${p.id}">Delete</button></div></div>`).join('') : '<p class="admin-note">No products yet — add the first one above.</p>';
  }
  async function saveProduct(event) {
    event.preventDefault(); if (!isAdmin) return;
    const id = document.querySelector('#product-id').value, payload = productPayload();
    const mainFile = document.querySelector('#product-image-file').files[0];
    const galleryFiles = Array.from(document.querySelector('#product-gallery-files').files);
    if (!payload.name || (!id && !mainFile)) return showStatus('Please choose a main photo.', true);
    try {
      showStatus('Uploading photos…');
      if (mainFile) payload.image_url = await uploadPhoto(mainFile);
      if (galleryFiles.length) {
        const existing = products.find(p => String(p.id) === String(id));
        payload.gallery_urls = [...(id && Array.isArray(existing?.gallery_urls) ? existing.gallery_urls : []), ...await Promise.all(galleryFiles.map(uploadPhoto))];
      }
      if (id && !payload.image_url) delete payload.image_url;
      if (id && !galleryFiles.length) delete payload.gallery_urls;
    } catch (error) { return showStatus(error.message || 'Photo upload failed.', true); }
    const query = id ? db.from('products').update(payload).eq('id', id) : db.from('products').insert(payload);
    const { error } = await query; if (error) return showStatus(error.message, true);
    showStatus(id ? 'Product updated.' : 'Product added.'); resetForm(); await loadProducts();
  }
  async function deleteProduct(id) {
    const product = products.find(p => String(p.id) === String(id));
    if (!product || !confirm(`Delete “${product.name}”? This cannot be undone.`)) return;
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) return showStatus(error.message, true); showStatus('Product deleted.'); await loadProducts();
  }
  function editProduct(id) {
    const p = products.find(x => String(x.id) === String(id)); if (!p) return;
    document.querySelector('#product-id').value = p.id; document.querySelector('#product-name').value = p.name || '';
    document.querySelector('#product-image-file').required = false;
    document.querySelector('#product-price').value = p.price ?? '';
    document.querySelector('#product-badge').value = p.badge || ''; document.querySelector('#product-subtitle').value = p.subtitle || '';
    document.querySelector('#product-category').value = p.category || 'road'; document.querySelector('#product-quantity').value = p.quantity ?? 0; document.querySelector('#product-status').value = p.status || 'available';
    document.querySelector('#product-specs').value = specs(p).map(s => `${s.label}: ${s.value}`).join('\n'); ui.save.textContent = 'Save changes'; ui.cancel.hidden = false;
    ui.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelector('#admin-open').addEventListener('click', openAdmin);
  document.querySelectorAll('[data-close-admin]').forEach(x => x.addEventListener('click', closeAdmin));
  ui.modal.addEventListener('click', e => { if (e.target === ui.modal) closeAdmin(); });
  document.querySelector('#login-form').addEventListener('submit', async e => {
    e.preventDefault(); showStatus('Signing in…'); const { error } = await db.auth.signInWithPassword({ email: document.querySelector('#login-email').value, password: document.querySelector('#login-password').value });
    if (error) return showStatus(error.message, true); if (!await checkAdmin()) { await db.auth.signOut(); return showStatus('This account is not an administrator.', true); }
    ui.login.hidden = true; ui.dashboard.hidden = false; showStatus('Signed in.'); renderAdminProducts();
  });
  document.querySelector('#sign-out').addEventListener('click', async () => { await db.auth.signOut(); isAdmin = false; ui.dashboard.hidden = true; ui.login.hidden = false; resetForm(); showStatus('Signed out.'); });
  ui.form.addEventListener('submit', saveProduct); ui.cancel.addEventListener('click', resetForm);
  ui.products.addEventListener('click', e => { const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-delete]'); if (edit) editProduct(edit.dataset.edit); if (del) deleteProduct(del.dataset.delete); });
  document.querySelectorAll('[data-product-category]').forEach(link => link.addEventListener('click', () => { activeCategory = link.dataset.productCategory; renderCatalog(); }));
  ui.grid.addEventListener('click', e => { if (e.target.closest('.catalog-reset')) { activeCategory = 'all'; renderCatalog(); } });
  db.auth.onAuthStateChange(() => checkAdmin()); loadProducts();
})();
