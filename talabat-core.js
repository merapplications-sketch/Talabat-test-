/* talabat-core.js v2 — Supabase backend. Same TLB API as v1, but actions are async (use await). */
(function () {
  'use strict';
  var SB_URL = 'https://dzydscryrnahnneydnry.supabase.co';
  var SB_KEY = 'sb_publishable_zQKbsSffub7O-f87vsXAaQ_GHFnSOQz';   /* publishable key: safe in the browser, RLS protects data */
  var LK = 'tlb_lang';
  var subs = [];
  function fire() { subs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- i18n RU / EN ---------- */
  var I = {
    ru: { pending: 'Ожидание подтверждения', preparing: 'Готовится', ready: 'Готов к выдаче курьеру', pickedup: 'Курьер в пути', delivered: 'Доставлено', rejected: 'Отклонён рестораном', cancelled: 'Отменён',
      err_closed: 'Ресторан сейчас закрыт', err_unavailable: 'Товар недоступен', err_empty: 'Корзина пуста', err_bad_transition: 'Действие недоступно', err_taken: 'Заказ уже взят другим курьером',
      confirm_cancel: 'Отменить заказ?', clear_cart: 'В корзине товары другого магазина. Очистить корзину?', accept: 'Принять', reject: 'Отклонить', add: 'Добавить', cart: 'Корзина', pay: 'Оплатить заказ', online: 'На линии', offline: 'Не в сети' },
    en: { pending: 'Waiting for confirmation', preparing: 'Preparing', ready: 'Ready for courier pickup', pickedup: 'Courier on the way', delivered: 'Delivered', rejected: 'Rejected by restaurant', cancelled: 'Cancelled',
      err_closed: 'The restaurant is closed right now', err_unavailable: 'Item unavailable', err_empty: 'Cart is empty', err_bad_transition: 'Action not allowed', err_taken: 'Order already taken by another courier',
      confirm_cancel: 'Cancel this order?', clear_cart: 'Your cart has items from another store. Clear it?', accept: 'Accept', reject: 'Reject', add: 'Add', cart: 'Cart', pay: 'Pay for order', online: 'Online', offline: 'Offline' }
  };
  var lang = 'ru';
  try { lang = localStorage.getItem(LK) || ((navigator.language || '').indexOf('en') === 0 ? 'en' : 'ru'); } catch (e) {}
  function t(k) { return (I[lang] && I[lang][k]) || I.ru[k] || k; }
  function applyI18n() {
    document.documentElement.lang = lang;
    [].forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    [].forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  }
  function setLang(l) { lang = l; try { localStorage.setItem(LK, l); } catch (e) {} applyI18n(); var b = document.getElementById('tlb-lang'); if (b) b.textContent = l === 'ru' ? 'RU | en' : 'ru | EN'; fire(); }
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div'); b.id = 'tlb-lang';
    b.style.cssText = 'position:fixed;top:3px;left:50%;transform:translateX(-50%);z-index:9999;background:#000a;color:#fff;font:700 10px sans-serif;padding:3px 9px;border-radius:10px;cursor:pointer';
    b.textContent = lang === 'ru' ? 'RU | en' : 'ru | EN';
    b.onclick = function () { setLang(lang === 'ru' ? 'en' : 'ru'); };
    document.body.appendChild(b); applyI18n();
  });


  Object.assign(I.ru, { login: 'Войти', signup: 'Регистрация', password: 'Пароль', logout: 'Выйти', wrongRole: 'Этот аккаунт не подходит для этого приложения. Выйдите и войдите другим аккаунтом.',
    pendingApp: 'Ваш аккаунт ожидает одобрения администратора.', signupOk: 'Аккаунт создан. Если нужно, подтвердите почту и войдите.', err_generic: 'Ошибка. Попробуйте ещё раз.',
    err_not_approved: 'Аккаунт курьера не одобрен', err_not_allowed: 'Недостаточно прав', err_store_unavailable: 'Магазин недоступен', err_auth: 'Войдите в аккаунт', err_user_not_found: 'Пользователь не найден' });
  Object.assign(I.en, { login: 'Sign in', signup: 'Sign up', password: 'Password', logout: 'Sign out', wrongRole: 'This account does not fit this app. Sign out and use another account.',
    pendingApp: 'Your account is waiting for admin approval.', signupOk: 'Account created. If needed, confirm your email and sign in.', err_generic: 'Something went wrong. Try again.',
    err_not_approved: 'Courier account is not approved', err_not_allowed: 'Not allowed', err_store_unavailable: 'Store unavailable', err_auth: 'Please sign in', err_user_not_found: 'User not found' });

  /* ---------- Supabase runtime ---------- */
  var sb = null, ME = null, need = '', onReady = null, sig = '', ORD = [];
  var DB = { stores: [], items: [], orders: [], oitems: [], chat: [], drivers: [], banners: [], favs: [] };
  function storeName(id) { var s = DB.stores.find(function (x) { return x.id === id; }); return s ? s.name : '?'; }
  function shapeItem(i) { return { id: i.id, name: i.name, price: +i.price, image: i.image_url || '', available: i.available, popular: i.popular, approved: i.approved, store: storeName(i.store_id) }; }
  function shape() {
    return DB.orders.map(function (o) {
      return { id: o.id, store: storeName(o.store_id), status: o.status,
        items: DB.oitems.filter(function (i) { return i.order_id === o.id; }).map(function (i) { return { id: i.item_id, name: i.name, price: +i.price, qty: i.qty, note: i.note || '' }; }),
        subtotal: +o.subtotal, discount: +o.discount, delivery: +o.delivery_fee, tip: +o.tip, total: +o.total, commission: +o.commission,
        payment: o.payment, address: o.address, prepTime: o.prep_time, driver: o.driver_id, driverName: o.driver_name || '', payout: +o.driver_payout,
        client: { name: o.customer_name || '', phone: o.customer_phone || '' }, customerId: o.customer_id,
        chat: DB.chat.filter(function (c) { return c.order_id === o.id; }).map(function (c) { return { s: c.sender_id === o.customer_id ? 'client' : 'driver', t: c.body, at: Date.parse(c.created_at) }; }),
        createdAt: Date.parse(o.created_at), doneAt: o.done_at ? Date.parse(o.done_at) : null };
    });
  }
  function refresh() {
    if (!ME) return Promise.resolve();
    return Promise.all([
      sb.from('stores').select('*').order('created_at'),
      sb.from('menu_items').select('*').order('created_at'),
      sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
      sb.from('order_items').select('*'),
      sb.from('order_chat').select('*').order('created_at'),
      ME.role === 'admin' ? sb.from('profiles').select('*').eq('role', 'driver') : Promise.resolve({ data: [] }),
      sb.from('banners').select('*').order('sort').order('created_at'),
      sb.from('favorites').select('store_id')
    ]).then(function (r) {
      var bad = r.slice(0, 6).find(function (x) { return x.error; });
      if (bad) { console.error(bad.error); return; }
      var s = JSON.stringify(r.map(function (x) { return x.data; }));
      if (s === sig) return;
      sig = s;
      DB.stores = r[0].data || []; DB.items = r[1].data || []; DB.orders = r[2].data || [];
      DB.oitems = r[3].data || []; DB.chat = r[4].data || []; DB.drivers = r[5].data || [];
      DB.banners = r[6].error ? [] : (r[6].data || []);
      DB.favs = r[7].error ? [] : (r[7].data || []).map(function (x) { return x.store_id; });
      ORD = shape(); fire();
    });
  }
  function errKey(e) {
    var m = String((e && e.message) || '').toLowerCase();
    var ks = ['store_unavailable', 'unavailable', 'closed', 'empty', 'bad_transition', 'not_approved', 'not_allowed', 'user_not_found', 'auth'];
    for (var i = 0; i < ks.length; i++) if (m.indexOf(ks[i]) >= 0) return ks[i];
    return 'generic';
  }
  function rpc(name, args) {
    return sb.rpc(name, args).then(function (r) {
      if (r.error) { console.error(r.error); return { error: errKey(r.error) }; }
      return refresh().then(function () { return { data: r.data }; });
    });
  }
  function done(r) { if (r.error) { console.error(r.error); return { error: 'generic' }; } return refresh().then(function () { return { ok: true }; }); }
  function storeByName(n) { return DB.stores.find(function (s) { return s.name === n; }); }

  /* ---------- login screens ---------- */
  var IN = 'style="width:100%;padding:12px;margin-bottom:10px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px"';
  var BT = 'style="width:100%;padding:13px;border:0;border-radius:10px;background:#ff5a00;color:#fff;font-weight:700;font-size:15px;margin-top:6px"';
  function overlay(html) {
    var d = $('tlb-ov');
    if (!d) { d = document.createElement('div'); d.id = 'tlb-ov'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9998;background:#f4f6f8;display:flex;align-items:center;justify-content:center;padding:20px;font:14px -apple-system,BlinkMacSystemFont,sans-serif'; document.body.appendChild(d); }
    d.innerHTML = '<div style="background:#fff;border-radius:16px;padding:22px;width:100%;max-width:340px;box-shadow:0 4px 20px #0002">' + html + '</div>';
    applyI18n();
  }
  function logout() { sb.auth.signOut().then(function () { location.reload(); }); }
  function showLogin(msg) {
    overlay('<h2 style="color:#ff5a00;margin-bottom:14px">Talabat</h2><input id="tlb-em" type="email" autocomplete="username" placeholder="Email" ' + IN + '><input id="tlb-pw" type="password" autocomplete="current-password" data-i18n-ph="password" ' + IN + '><div id="tlb-er" style="color:#e74c3c;font-size:12px;margin-bottom:8px;min-height:14px">' + esc(msg || '') + '</div><button id="tlb-go" data-i18n="login" ' + BT + '></button>' +
      (need === 'customer' ? '<button id="tlb-su" data-i18n="signup" ' + BT.replace('#ff5a00', '#edf2f7').replace('#fff', '#2d3748') + '></button>' : ''));
    var go = function (signup) {
      var args = { email: $('tlb-em').value.trim(), password: $('tlb-pw').value };
      $('tlb-er').textContent = '';
      (signup ? sb.auth.signUp(args) : sb.auth.signInWithPassword(args)).then(function (r) {
        if (r.error) { $('tlb-er').textContent = r.error.message; return; }
        if (!r.data.session) { $('tlb-er').textContent = t('signupOk'); return; }
        enter(r.data.user);
      });
    };
    $('tlb-go').onclick = function () { go(false); };
    if ($('tlb-su')) $('tlb-su').onclick = function () { go(true); };
  }
  function blocked(key) {
    overlay('<h3 style="margin-bottom:10px;color:#1a202c" data-i18n="' + key + '"></h3><p style="color:#718096;margin-bottom:14px;font-size:13px">' + esc(ME.email) + ' — ' + esc(ME.role) + '</p><button id="tlb-lo" data-i18n="logout" ' + BT + '></button>');
    $('tlb-lo').onclick = logout;
  }
  function logoutBtn() {
    if ($('tlb-out')) return;
    var b = document.createElement('div'); b.id = 'tlb-out'; b.setAttribute('data-i18n', 'logout'); b.textContent = t('logout');
    b.style.cssText = 'position:fixed;top:3px;right:6px;z-index:9999;background:#000a;color:#fff;font:700 10px sans-serif;padding:3px 9px;border-radius:10px;cursor:pointer';
    b.onclick = logout; document.body.appendChild(b);
  }
  function enter(user) {
    return sb.from('profiles').select('*').eq('id', user.id).single().then(function (x) {
      if (x.error || !x.data) { showLogin(x.error ? x.error.message : 'profile'); return; }
      ME = Object.assign({ email: user.email }, x.data);
      logoutBtn();
      if (ME.role !== need) return blocked('wrongRole');
      if (need === 'driver' && ME.driver_status !== 'approved') return blocked('pendingApp');
      var o = $('tlb-ov'); if (o) o.remove();
      return refresh().then(function () {
        sb.channel('tlb').on('postgres_changes', { event: '*', schema: 'public' }, function () { refresh(); }).subscribe();
        setInterval(refresh, 4000);
        onReady({ id: ME.id, name: ME.name || ME.email, email: ME.email, phone: ME.phone || '' });
      });
    });
  }

  /* ---------- API ---------- */
  window.TLB = {
    t: t, esc: esc, applyI18n: applyI18n, setLang: setLang, lang: function () { return lang; },
    addDict: function (ru, en) { Object.assign(I.ru, ru); Object.assign(I.en, en); },
    on: function (f) { subs.push(f); },
    /* role: 'customer' | 'merchant' | 'driver' | 'admin'. Each role keeps its own session, so all 4 apps can be open in one browser. */
    start: function (role, cb) {
      need = role; onReady = cb;
      sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { storageKey: 'tlb-auth-' + role } });
      sb.auth.getSession().then(function (x) { if (x.data.session) enter(x.data.session.user); else showLogin(); });
    },
    me: function () { return ME; },
    logout: logout,

    stores: function (all) { return DB.stores.filter(function (s) { return all || s.is_active; }); },
    myStores: function () { return DB.stores.filter(function (s) { return ME && s.owner_id === ME.id; }); },
    drivers: function () { return DB.drivers; },
    pendingItems: function () { return DB.items.filter(function (i) { return !i.approved; }).map(shapeItem); },
    allMenus: function (onlyAvail) {
      var o = {}; DB.stores.forEach(function (s) { o[s.name] = []; });
      DB.items.forEach(function (i) { if (onlyAvail && !(i.available && i.approved)) return; var n = storeName(i.store_id); if (o[n]) o[n].push(shapeItem(i)); });
      return o;
    },
    getMenu: function (n) { return this.allMenus(false)[n] || []; },
    isOpen: function (n) { var s = storeByName(n); return !!s && s.is_open && s.is_active; },
    setOpen: function (n, v) { var s = storeByName(n); return s ? rpc('set_store_open', { p_store: s.id, p_open: !!v }) : Promise.resolve({ error: 'generic' }); },

    order: function (id) { return ORD.find(function (o) { return o.id == id; }) || null; },
    orders: function (fn) { return ORD.filter(fn || function () { return true; }); },
    offers: function () { return ORD.filter(function (o) { return !o.driver && (o.status === 'preparing' || o.status === 'ready'); }); },
    placeOrder: function (o) {
      var s = storeByName(o.store); if (!s) return Promise.resolve({ error: 'store_unavailable' });
      var items = Object.keys(o.cart).map(function (id) { return { item_id: id, qty: o.cart[id], note: (o.notes || {})[id] || '' }; });
      return rpc('place_order', { p_store: s.id, p_items: items, p_tip: o.tip || 0, p_payment: o.payment || '', p_address: o.address || '', p_lat: null, p_lng: null })
        .then(function (r) { return r.error ? r : { id: r.data }; });
    },
    setStatus: function (id, to) { return rpc('set_order_status', { p_id: id, p_to: to }); },
    patch: function (id, f) { return rpc('set_prep_time', { p_id: id, p_min: f.prepTime }); },
    driverAccept: function (id) { return rpc('driver_accept', { p_id: id }).then(function (r) { return r.error ? r : (r.data === true ? { ok: true } : { error: 'taken' }); }); },
    chat: function (id, sender, text) { return sb.from('order_chat').insert({ order_id: id, sender_id: ME.id, body: String(text).slice(0, 200) }).then(done); },

    addItem: function (storeN, f) { var s = storeByName(storeN); return sb.from('menu_items').insert({ store_id: s.id, name: f.name, price: f.price, image_url: f.image || null, popular: !!f.popular }).then(done); },
    updateItem: function (id, f) { return sb.from('menu_items').update(f).eq('id', id).then(done); },
    deleteItem: function (id) { return sb.from('menu_items').delete().eq('id', id).then(done); },
    approveItem: function (id) { return sb.from('menu_items').update({ approved: true }).eq('id', id).then(done); },

    addStore: function (f) { return sb.from('stores').insert(f).then(done); },
    updateStore: function (id, f) { return sb.from('stores').update(f).eq('id', id).then(done); },
    updateMyStore: function (storeN, f) { var s = storeByName(storeN); if (!s) return Promise.resolve({ error: 'generic' }); return rpc('update_my_store', { p_store: s.id, p_description: f.description == null ? null : f.description, p_cover: f.cover || null }); },
    assignOwner: function (id, email) { return rpc('assign_owner', { p_store: id, p_email: email }); },
    setDriverStatus: function (id, st) { return sb.from('profiles').update({ driver_status: st }).eq('id', id).then(done); },

    banners: function (all) { return DB.banners.filter(function (b) { return all || b.is_active; }); },
    addBanner: function (f) { return sb.from('banners').insert(f).then(done); },
    updateBanner: function (id, f) { return sb.from('banners').update(f).eq('id', id).then(done); },
    deleteBanner: function (id) { return sb.from('banners').delete().eq('id', id).then(done); },
    isFav: function (storeId) { return DB.favs.indexOf(storeId) >= 0; },
    toggleFav: function (storeId) {
      var has = DB.favs.indexOf(storeId) >= 0;
      DB.favs = has ? DB.favs.filter(function (x) { return x !== storeId; }) : DB.favs.concat([storeId]);
      fire();
      var q = has ? sb.from('favorites').delete().eq('user_id', ME.id).eq('store_id', storeId) : sb.from('favorites').insert({ user_id: ME.id, store_id: storeId });
      return q.then(function (r) { if (r.error) console.error(r.error); sig = ''; return refresh(); });
    }
  };
})();
