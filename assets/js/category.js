(() => {
  const config = window.BIKE_MASTERS_CONFIG;
  const params = new URLSearchParams(location.search);
  const category = (params.get('category') || 'road').toLowerCase();
  const names = {road:'Road bikes', mountain:'Mountain bikes', kids:'Kids bikes', gravel:'Gravel bikes', electric:'E-bikes', hybrid:'Hybrid bikes', bmx:'BMX bikes', triathlon:'Triathlon', frameset:'Framesets', accessories:'Accessories', clothing:'Clothing', components:'Components', wheels:'Wheels & tyres', trainers:'Turbo trainers', nutrition:'Nutrition', sale:'Sale'};
  const title = names[category] || category.replace(/[-_]/g, ' ');
  document.title = `${title} · Bike Masters`;
  document.querySelector('#category-eyebrow').textContent = `Shop category · ${title}`;
  document.querySelector('#category-title').textContent = title;
  const grid = document.querySelector('#category-products');
  if (!config || !window.supabase) { grid.innerHTML = '<p class="catalog-message">Catalog setup is unavailable.</p>'; return; }
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  const money = n => new Intl.NumberFormat('en-EG').format(Number(n || 0)) + ' EGP';
  db.from('products').select('*').order('created_at', { ascending: false }).then(({data, error}) => {
    if (error) { grid.innerHTML = '<p class="catalog-message">The catalog is temporarily unavailable.</p>'; return; }
    const products = (data || []).filter(p => String(p.category || '').toLowerCase().replace(/[\s_-]+/g, '') === category.replace(/[\s_-]+/g, '') || (category === 'road' && /road/.test(String(p.category || '').toLowerCase())));
    grid.innerHTML = products.length ? products.map(p => `<article class="ticket"><a class="ticket-link" href="bike.html?id=${encodeURIComponent(p.id)}"><div class="ticket-photo"><img src="${p.image_url || 'assets/images/image-01.jpg'}" alt="${p.name || ''}"><span class="ticket-price">${money(p.price)}</span></div><div class="ticket-body"><h3>${p.name || ''}</h3><div class="ticket-sub">${p.subtitle || ''}</div></div></a></article>`).join('') : '<p class="catalog-message">No products are listed in this category yet.</p>';
  });
})();
