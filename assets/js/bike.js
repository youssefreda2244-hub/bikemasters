(() => {
  const config = window.BIKE_MASTERS_CONFIG, target = document.querySelector('#bike-detail');
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = n => new Intl.NumberFormat('en-EG').format(Number(n || 0)) + ' EGP';
  const id = new URLSearchParams(location.search).get('id');
  if (!config || !window.supabase || !id) { target.innerHTML = '<p class="catalog-message">Bike not found.</p>'; return; }
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  db.from('products').select('*').eq('id', id).maybeSingle().then(({ data: p, error }) => {
    if (error || !p) { target.innerHTML = '<p class="catalog-message">Bike not found. <a href="index.html#bikes">Return to all bikes</a>.</p>'; return; }
    const photos = [p.image_url, ...(Array.isArray(p.gallery_urls) ? p.gallery_urls : [])].filter(Boolean);
    const specs = (Array.isArray(p.specs) ? p.specs : []).map(s => `<li><span>${esc(s.label)}</span><span>${esc(s.value)}</span></li>`).join('');
    const available = p.status === 'available' && Number(p.quantity) > 0;
    const message = encodeURIComponent(`Hi Bike Masters, I’d like to ask about ${p.name}.`);
    target.innerHTML = `<article class="bike-detail"><div class="bike-gallery"><img id="main-bike-photo" src="${esc(photos[0] || 'assets/images/image-01.jpg')}" alt="${esc(p.name)}"><div class="bike-thumbnails">${photos.map((url, i) => `<button class="bike-thumb${i === 0 ? ' is-active' : ''}" type="button" data-photo="${esc(url)}"><img src="${esc(url)}" alt="${esc(p.name)} photo ${i + 1}"></button>`).join('')}</div></div><div class="bike-copy"><span class="eyebrow">${available ? 'Available now' : 'Sold out'}</span><h1>${esc(p.name)}</h1><p class="bike-price">${money(p.price)}</p><p class="bike-subtitle">${esc(p.subtitle || '')}</p><ul class="spec-list">${specs || '<li><span>Details</span><span>Contact shop</span></li>'}</ul>${available ? `<a class="btn btn-primary bike-contact" href="https://wa.me/${config.whatsappNumber}?text=${message}" target="_blank" rel="noopener">Ask about this bike</a>` : '<p class="catalog-message">Currently unavailable.</p>'}</div></article>`;
    let activePhoto = 0;
    const showPhoto = index => {
      activePhoto = (index + photos.length) % photos.length;
      document.querySelector('#main-bike-photo').src = photos[activePhoto];
      document.querySelectorAll('.bike-thumb').forEach((x, i) => x.classList.toggle('is-active', i === activePhoto));
    };
    target.addEventListener('click', event => { const button = event.target.closest('[data-photo]'); if (!button) return; showPhoto(photos.indexOf(button.dataset.photo)); });
    const mainPhoto = document.querySelector('#main-bike-photo');
    let swipeStartX = 0;
    mainPhoto.addEventListener('touchstart', event => { swipeStartX = event.changedTouches[0].screenX; }, { passive: true });
    mainPhoto.addEventListener('touchend', event => {
      const distance = event.changedTouches[0].screenX - swipeStartX;
      if (Math.abs(distance) < 45 || photos.length < 2) return;
      showPhoto(activePhoto + (distance < 0 ? 1 : -1));
    }, { passive: true });
    let dragStartX = null;
    mainPhoto.addEventListener('mousedown', event => { dragStartX = event.screenX; });
    mainPhoto.addEventListener('mouseup', event => {
      if (dragStartX === null || photos.length < 2) return;
      const distance = event.screenX - dragStartX;
      dragStartX = null;
      if (Math.abs(distance) >= 45) showPhoto(activePhoto + (distance < 0 ? 1 : -1));
    });
    mainPhoto.addEventListener('mouseleave', () => { dragStartX = null; });
  });
})();
