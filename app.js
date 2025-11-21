/* POS Offline Prototype
   - Uses sql.js to keep a SQLite DB in browser
   - Uses @zxing/browser for EAN-13 scanning
   - Persists DB to localStorage as base64 export
*/

const DB_KEY = 'pos_db_base64_v1';
let SQL; // sql.js module
let db;

const ZX = window.ZXingBrowser || window.ZXing || window.BrowserBarcodeReader || null;

async function initSqlJs() {
  if (!window.initSqlJs) throw new Error('sql.js not loaded');
  SQL = await window.initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}` });
  // try load from localStorage
  const b64 = localStorage.getItem(DB_KEY);
  if (b64) {
    const bytes = base64ToUint8Array(b64);
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
    createSchema();
    await seedDemo();
    persistDb();
  }
}

/* Mobile banner: show on small screens unless dismissed by user */
function setupMobileBanner(){
  const banner = document.getElementById('mobile-banner');
  if (!banner) return;
  const closeBtn = document.getElementById('mobile-banner-close');
  function updateVisibility(){
    const dismissed = localStorage.getItem('mobileBannerDismissed') === '1';
    if (dismissed){ banner.style.display = 'none'; return; }
    if (window.innerWidth <= 699) banner.style.display = 'block';
    else banner.style.display = 'none';
  }
  if (closeBtn){
    closeBtn.addEventListener('click', ()=>{
      banner.style.display = 'none';
      localStorage.setItem('mobileBannerDismissed','1');
    });
  }
  window.addEventListener('resize', updateVisibility);
  updateVisibility();
}

function createSchema(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      username TEXT PRIMARY KEY,
      password TEXT,
      role TEXT
    );
    CREATE TABLE IF NOT EXISTS products(
      kode_barang TEXT PRIMARY KEY,
      nama TEXT,
      harga REAL,
      stok INTEGER,
      kategori TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      nomor_invoice TEXT,
      metode_pembayaran TEXT,
      total REAL
    );
    CREATE TABLE IF NOT EXISTS transaction_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER,
      kode_barang TEXT,
      nama_produk TEXT,
      jumlah INTEGER,
      harga_satuan REAL,
      total REAL
    );
    CREATE TABLE IF NOT EXISTS logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      type TEXT,
      description TEXT
    );
  `);
}

async function seedDemo(){
  // small demo data for testing
  const demo = [
    ['8901234567897','Sabun Mandi',12000,50,'Kesehatan'],
    ['8901234567898','Sikat Gigi',8000,30,'Kesehatan'],
    ['8901234567890','Minuman A',5000,100,'Minuman']
  ];
  const stmt = db.prepare('INSERT OR REPLACE INTO products VALUES (?,?,?,?,?)');
  demo.forEach(r=>{stmt.run(r)});
  stmt.free();

  // seed default admin user (username: admin, password: admin123)
  const adminHash = await hashPassword('admin123');
  db.run('INSERT OR REPLACE INTO users(username,password,role) VALUES(?,?,?)',['admin',adminHash,'admin']);
}

function persistDb(){
  const data = db.export();
  const b64 = uint8ArrayToBase64(data);
  localStorage.setItem(DB_KEY,b64);
}

function uint8ArrayToBase64(u8){
  let s = '';
  for (let i=0;i<u8.length;i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function base64ToUint8Array(b64){
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i=0;i<s.length;i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function findProductByCode(code){
  const res = db.exec(`SELECT * FROM products WHERE kode_barang = $k`, { $k: code });
  if (res.length===0) return null;
  const row = res[0].values[0];
  const cols = res[0].columns;
  const obj = {};
  cols.forEach((c,i)=>obj[c]=row[i]);
  return obj;
}

function findUser(username){
  const res = db.exec('SELECT * FROM users WHERE username = $u', { $u: username });
  if (res.length===0) return null;
  const row = res[0].values[0];
  const cols = res[0].columns;
  const obj = {};
  cols.forEach((c,i)=>obj[c]=row[i]);
  return obj;
}

async function authenticateUser(username,password){
  const u = findUser(username);
  if (!u) return false;
  const h = await hashPassword(password);
  return u.password === h && u.role === 'admin';
}

async function createUser(username,password,role='cashier'){
  const h = await hashPassword(password);
  // validate password strength
  if (!validatePasswordStrength(password, role)) throw new Error('Password tidak memenuhi syarat');
  const h = await hashPassword(password);
  db.run('INSERT OR REPLACE INTO users(username,password,role) VALUES(?,?,?)',[username,h,role]);
  persistDb();
}

async function hashPassword(pw){

  function validatePasswordStrength(pw, role='cashier'){
    if (!pw) return false;
    if (pw.length < 6) return false;
    // for admin require at least one digit and one letter
    if (role === 'admin'){
      if (!/[0-9]/.test(pw)) return false;
      if (!/[A-Za-z]/.test(pw)) return false;
    }
    return true;
  }

  function countAdmins(){
    const res = db.exec("SELECT COUNT(*) as c FROM users WHERE role='admin'");
    if (res.length===0) return 0;
    return res[0].values[0][0];
  }
  // simple SHA-256 hashing using SubtleCrypto; returns hex string
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,'0')).join('');
}

function addOrUpdateProduct(prod){
  db.run('INSERT OR REPLACE INTO products(kode_barang,nama,harga,stok,kategori) VALUES(?,?,?,?,?)',
    [prod.kode_barang,prod.nama,prod.harga,prod.stok,prod.kategori]);
  log('product_update', `Simpan produk ${prod.kode_barang} - ${prod.nama}`);
  persistDb();
}

function updateStock(kode, delta){
  const p = findProductByCode(kode);
  if (!p) return false;
  const newStok = (p.stok|0) + delta;
  db.run('UPDATE products SET stok=? WHERE kode_barang=?',[newStok,kode]);
  log('stock_change', `Stok ${kode} berubah: ${p.stok} -> ${newStok}`);
  persistDb();
  return true;
}

function saveTransaction(cart, metode){
  const now = new Date().toISOString();
  const nomor = `INV-${Date.now()}`;
  const total = cart.reduce((s,i)=>s + (i.jumlah * i.harga_satuan),0);
  const st = db.prepare('INSERT INTO transactions(date,nomor_invoice,metode_pembayaran,total) VALUES(?,?,?,?)');
  st.run([now,nomor,metode,total]);
  st.free();
  const txId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  const itSt = db.prepare('INSERT INTO transaction_items(transaction_id,kode_barang,nama_produk,jumlah,harga_satuan,total) VALUES(?,?,?,?,?,?)');
  cart.forEach(it=>{
    itSt.run([txId,it.kode_barang,it.nama_produk,it.jumlah,it.harga_satuan,it.jumlah*it.harga_satuan]);
    updateStock(it.kode_barang, -it.jumlah);
  });
  itSt.free();
  log('transaction', `Transaksi ${nomor} dibuat, total ${total}`);
  persistDb();
  return {nomor, total};
}

function log(type, desc){
  const t = new Date().toISOString();
  db.run('INSERT INTO logs(date,type,description) VALUES(?,?,?)',[t,type,desc]);
  persistDb();
}

/* UI handlers */
let role = null;
let cart = [];
let currentUser = null;

function $(id){return document.getElementById(id)}

function renderProducts(){
  const res = db.exec('SELECT * FROM products');
  const tbody = $('products-table').querySelector('tbody');
  tbody.innerHTML = '';
  if (res.length===0) return;
  const cols = res[0].columns;
  res[0].values.forEach(row=>{
    const obj = {};
    cols.forEach((c,i)=>obj[c]=row[i]);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${obj.kode_barang}</td><td>${obj.nama}</td><td>${obj.harga}</td><td>${obj.stok}</td><td>${obj.kategori}</td><td><button class="small" data-kode="${obj.kode_barang}">Edit</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderLogs(){
  const res = db.exec('SELECT * FROM logs ORDER BY id DESC LIMIT 50');
  const list = $('logs'); list.innerHTML='';
  if (res.length===0) return;
  const cols = res[0].columns;
  res[0].values.forEach(row=>{
    const obj = {};
    cols.forEach((c,i)=>obj[c]=row[i]);
    const li = document.createElement('li');
    li.textContent = `${obj.date} | ${obj.type} | ${obj.description}`;
    list.appendChild(li);
  });
}

function addToCart(product, qty=1){
  const existing = cart.find(c=>c.kode_barang===product.kode_barang);
  if (existing) existing.jumlah += qty;
  else cart.push({kode_barang:product.kode_barang,nama_produk:product.nama,jumlah:qty,harga_satuan:product.harga});
  renderCart();
}

function renderCart(){
  const tbody = $('cart-table').querySelector('tbody');
  tbody.innerHTML = '';
  let total = 0;
  cart.forEach((it,idx)=>{
    const tr = document.createElement('tr');
    const t = it.jumlah * it.harga_satuan; total += t;
    tr.innerHTML = `<td>${it.nama_produk}</td><td><input type="number" value="${it.jumlah}" min="1" data-idx="${idx}" class="item-qty"/></td><td>${it.harga_satuan}</td><td>${t}</td><td><button data-idx="${idx}" class="remove">Hapus</button></td>`;
    tbody.appendChild(tr);
  });
  $('total-value').textContent = total;
}

function setupUI(){
  $('btn-login').addEventListener('click',async ()=>{
    const r = $('login-role').value;
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    if (!username){ alert('Masukkan username'); return }
    if (r === 'admin'){
      if (!password){ alert('Masukkan password admin'); return }
      if (!await authenticateUser(username,password)){
        alert('Autentikasi gagal. Pastikan username/password benar.'); return
      }
    }
    // for cashier we accept username only
    currentUser = { username, role: r };
    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('header-user').classList.remove('hidden');
    document.getElementById('current-user').textContent = `${currentUser.role.toUpperCase()}: ${currentUser.username}`;
    switchRole(r);
  });
  $('btn-logout').addEventListener('click',()=>{
    currentUser = null; role = null; cart = [];
    document.getElementById('header-user').classList.add('hidden');
    document.getElementById('login-box').classList.remove('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  });
  $('btn-start-scan').addEventListener('click',startScanner);
  $('btn-stop-scan').addEventListener('click',stopScanner);
  $('btn-manual-add').addEventListener('click',()=>{
    const code = $('manual-code').value.trim();
    if (!code){alert('Masukkan kode barang');return}
    const p = findProductByCode(code);
    if (p){ addToCart(p); }
    else alert('Kode tidak ditemukan. Coba input manual lengkap atau hubungi admin.');
  });
  $('cart-table').addEventListener('input',e=>{
    if (e.target.classList.contains('item-qty')){
      const idx = +e.target.dataset.idx; const val = Number(e.target.value)||1; cart[idx].jumlah = val; renderCart();
    }
  });
  $('cart-table').addEventListener('click',e=>{
    if (e.target.classList.contains('remove')){
      const idx = +e.target.dataset.idx; cart.splice(idx,1); renderCart();
    }
  });
  $('btn-save-transaction').addEventListener('click',()=>{
    if (cart.length===0){alert('Cart kosong');return}
    const metode = $('payment-method').value;
    try{
      const r = saveTransaction(cart, metode);
      alert(`Transaksi ${r.nomor} tersimpan (Total ${r.total})`);
      cart = []; renderCart(); renderProducts(); renderLogs();
    }catch(err){alert('Gagal simpan transaksi: '+err.message)}
  });

  $('btn-add-product').addEventListener('click',()=>{
    const prod = {
      kode_barang: $('p-kode').value.trim(),
      nama: $('p-nama').value.trim(),
      harga: parseFloat($('p-harga').value)||0,
      stok: parseInt($('p-stok').value)||0,
      kategori: $('p-kategori').value.trim()||''
    };
    if (!prod.kode_barang || !prod.nama){alert('Kode dan nama wajib');return}
    addOrUpdateProduct(prod); renderProducts(); renderLogs();
    alert('Produk disimpan');
  });

  // User management handlers (admin)
  const addUserBtn = $('btn-add-user');
  if (addUserBtn){
    addUserBtn.addEventListener('click', async ()=>{
      const u = $('u-username').value.trim();
      const p = $('u-password').value;
      const rl = $('u-role').value;
      if (!u || !p){ alert('Username dan password wajib'); return }
      if (!validatePasswordStrength(p, rl)){ alert('Password tidak memenuhi syarat (min 6; admin harus memiliki huruf & angka)'); return }
      try{ await createUser(u,p,rl); renderUsers(); populateUserSelect(); alert('User disimpan'); }
      catch(err){ alert('Gagal simpan user: '+err.message); }
    });
  }

  // users table delegation (delete)
  const usersTable = $('users-table');
  if (usersTable){
    usersTable.addEventListener('click', e=>{
      const btn = e.target;
      if (btn && btn.dataset && btn.dataset.username){
        const uname = btn.dataset.username;
        if (!confirm('Hapus user '+uname+'?')) return;
        try{
          const u = findUser(uname);
          if (!u) throw new Error('User tidak ditemukan');
          if (u.role === 'admin' && countAdmins() <= 1){ alert('Tidak bisa menghapus admin terakhir'); return; }
          db.run('DELETE FROM users WHERE username = ?',[uname]);
          persistDb();
          renderUsers();
          populateUserSelect();
        }catch(err){ alert('Gagal hapus user: '+err.message); }
      }
    });
  }

  // change password handler
  const changeBtn = $('btn-change-password');
  if (changeBtn){
    changeBtn.addEventListener('click', async ()=>{
      const target = $('u-select-user').value;
      const newpw = $('u-new-password').value;
      if (!target) { alert('Pilih user'); return }
      if (!newpw) { alert('Masukkan password baru'); return }
      const u = findUser(target);
      if (!u) { alert('User tidak ditemukan'); return }
      if (!validatePasswordStrength(newpw, u.role)){ alert('Password tidak memenuhi syarat'); return }
      try{ await changePassword(target,newpw); alert('Password diubah'); $('u-new-password').value=''; }
      catch(err){ alert('Gagal ubah password: '+err.message); }
    });
  }
}

function renderUsers(){
  const res = db.exec('SELECT username,role FROM users');
  const tbody = $('users-table').querySelector('tbody');
  tbody.innerHTML = '';
  if (res.length===0) return;
  const cols = res[0].columns;
  res[0].values.forEach(row=>{
    const obj = {};
    cols.forEach((c,i)=>obj[c]=row[i]);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${obj.username}</td><td>${obj.role}</td><td><button data-username="${obj.username}">Hapus</button></td>`;
    tbody.appendChild(tr);
  });
  populateUserSelect();
}

function populateUserSelect(){
  const sel = $('u-select-user');
  if (!sel) return;
  sel.innerHTML = '';
  const res = db.exec('SELECT username FROM users');
  if (res.length===0) return;
  res[0].values.forEach(r=>{
    const opt = document.createElement('option'); opt.value = r[0]; opt.textContent = r[0]; sel.appendChild(opt);
  });
}

async function changePassword(username,newpw){
  const u = findUser(username);
  if (!u) throw new Error('User tidak ditemukan');
  const h = await hashPassword(newpw);
  db.run('UPDATE users SET password = ? WHERE username = ?',[h,username]);
  persistDb();
  log('user_change', `Password diubah untuk ${username}`);
}

/* Backup / Restore database functions */
function getDatabaseBase64(){
  const data = db.export();
  return uint8ArrayToBase64(data);
}

function exportDatabaseFile(){
  const data = db.export();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pos_db.sqlite'; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importDatabaseFromBytes(u8){
  try{
    const newDb = new SQL.Database(u8);
    db = newDb;
    persistDb();
    renderProducts(); renderUsers(); renderLogs(); populateUserSelect();
    log('db_restore', 'Database diimport dari file/base64');
    return true;
  }catch(err){ console.error(err); return false; }
}

async function importDatabaseFromFile(file){
  if (!file) return false;
  if (!confirm('Import file akan menggantikan seluruh database lokal. Lanjutkan?')) return false;
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      const ab = e.target.result;
      const u8 = new Uint8Array(ab);
      const ok = importDatabaseFromBytes(u8);
      if (ok) resolve(true); else reject(new Error('Gagal import DB'));
    };
    fr.onerror = err=>reject(err);
    fr.readAsArrayBuffer(file);
  });
}

function importDatabaseFromBase64(b64){
  if (!b64) return false;
  if (!confirm('Import base64 akan menggantikan seluruh database lokal. Lanjutkan?')) return false;
  try{
    const u8 = base64ToUint8Array(b64.trim());
    const ok = importDatabaseFromBytes(u8);
    return ok;
  }catch(err){ console.error(err); return false; }
}

function setupBackupUI(){
  const btnExportFile = $('btn-export-sqlite');
  const btnExportBase64 = $('btn-export-base64');
  const btnCopyBase64 = $('btn-copy-base64');
  const fileInput = $('file-import-input');
  const btnImportFile = $('btn-import-file');
  const txtBase64 = $('base64-textarea');
  const btnImportBase64 = $('btn-import-base64');
  const status = $('backup-status');

  if (btnExportFile) btnExportFile.addEventListener('click', ()=>{
    try{ exportDatabaseFile(); status.textContent='Ekspor file .sqlite selesai.' }catch(err){ status.textContent='Gagal ekspor: '+err.message }
  });
  if (btnExportBase64) btnExportBase64.addEventListener('click', ()=>{
    try{ const b64 = getDatabaseBase64(); if (txtBase64) txtBase64.value = b64; status.textContent='Base64 dihasilkan.' }catch(err){ status.textContent='Gagal ekspor base64' }
  });
  if (btnCopyBase64) btnCopyBase64.addEventListener('click', async ()=>{
    try{ const b64 = getDatabaseBase64(); await navigator.clipboard.writeText(b64); status.textContent='Base64 disalin ke clipboard.' }catch(err){ status.textContent='Gagal salin base64' }
  });
  if (btnImportFile) btnImportFile.addEventListener('click', async ()=>{
    const f = fileInput && fileInput.files && fileInput.files[0];
    if (!f){ alert('Pilih file .sqlite untuk diimport'); return }
    try{ await importDatabaseFromFile(f); status.textContent='Import file selesai.'; alert('Database berhasil diimport.'); }
    catch(err){ status.textContent='Gagal import file'; alert('Gagal import: '+err.message); }
  });
  if (btnImportBase64) btnImportBase64.addEventListener('click', ()=>{
    const b64 = txtBase64 && txtBase64.value;
    if (!b64){ alert('Tempelkan base64 terlebih dahulu'); return }
    const ok = importDatabaseFromBase64(b64);
    if (ok){ status.textContent='Import base64 selesai.'; alert('Database berhasil diimport.'); }
    else { status.textContent='Gagal import base64'; alert('Gagal import base64'); }
  });
}

function switchRole(r){
  role = r;
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  if (r==='cashier'){
    $('cashier-page').classList.remove('hidden');
    // show cashier username on the page
    let el = document.getElementById('cashier-username-display');
    if (!el){
      el = document.createElement('div'); el.id='cashier-username-display'; el.style.margin='8px 0';
      $('cashier-page').insertBefore(el,$('cashier-page').firstChild);
    }
    el.textContent = `Kasir: ${currentUser ? currentUser.username : ''}`;
  } else $('admin-page').classList.remove('hidden');
}

/* Barcode scanner using @zxing/browser */
let codeReader = null;
let streaming = false;

async function startScanner(){
  if (!window.BrowserBarcodeReader && !window.ZXingBrowser && !window.BrowserCodeReader){
    alert('Scanner library tidak tersedia');
    return;
  }
  try{
    // ZXing BrowserBarcodeReader
    const BrowserMultiFormatReader = window.BrowserMultiFormatReader || window.BrowserBarcodeReader || (window.ZXing && window.ZXing.BrowserMultiFormatReader);
    if (!BrowserMultiFormatReader) { alert('Library scanner tidak kompatibel'); return }
    codeReader = new BrowserMultiFormatReader();
    $('scanner').classList.remove('hidden');
    const videoElem = $('video');
    streaming = true;
    codeReader.decodeFromVideoDevice(null, videoElem, (result, err) => {
      if (result) {
        const text = result.getText();
        // Validate EAN-13 length
        if (text && text.length>=12){
          handleScannedCode(text);
        }
      }
      if (err && !(err instanceof window.NotFoundException)){
        console.warn(err);
      }
    });
  }catch(err){
    alert('Gagal membuka kamera: '+err.message);
    $('scanner-message').textContent = 'Gagal buka kamera';
    console.error(err);
  }
}

function stopScanner(){
  if (codeReader){ codeReader.reset(); codeReader=null; }
  streaming = false; $('scanner').classList.add('hidden');
}

function handleScannedCode(code){
  // EAN sometimes contains extras; keep last 13 digits
  if (code.length>13) code = code.slice(-13);
  const p = findProductByCode(code);
  if (p){ addToCart(p); renderCart(); }
  else {
    alert('Barang tidak ditemukan di database (kode: '+code+'). Anda bisa tambah barang lewat halaman Admin.');
  }
}

/* Init app */
async function start(){
  try{
    await initSqlJs();
  }catch(err){
    alert('Gagal inisialisasi database: '+err.message);
    console.error(err); return;
  }
  setupUI(); renderProducts(); renderLogs();
  // render users list in admin
  try{ renderUsers(); }catch(e){}
  try{ setupBackupUI(); }catch(e){}
  try{ setupPasswordStrengthIndicators(); }catch(e){}
  try{ setupMobileBanner(); }catch(e){}
  // Register service worker for offline support
  if ('serviceWorker' in navigator){
    try{
      const reg = await navigator.serviceWorker.register('/service-worker.js');
      console.log('SW registered', reg);
      // listen for updates
      if (reg.installing) handleSWInstalling(reg.installing);
      reg.addEventListener('updatefound', ()=>{ handleSWInstalling(reg.installing); });
      // optional: check for waiting service worker
      if (reg.waiting){ if (confirm('Versi baru tersedia. Muat ulang untuk memperbarui?')){ reg.waiting.postMessage({type:'SKIP_WAITING'}); window.location.reload(); } }
    }
    catch(err){ console.warn('SW register failed', err); }
  }
}

function handleSWInstalling(worker){
  if (!worker) return;
  worker.addEventListener('statechange', ()=>{
    console.log('SW state:', worker.state);
    if (worker.state === 'installed'){
      if (navigator.serviceWorker.controller){
        // new update installed
        if (confirm('Ada pembaruan baru untuk aplikasi. Muat ulang sekarang?')){
          worker.postMessage({type:'SKIP_WAITING'});
          window.location.reload();
        }
      }
    }
  });
}

// Password strength indicator handlers
function setupPasswordStrengthIndicators(){
  const p1 = $('u-password');
  const p2 = $('u-new-password');
  const out = $('pwd-strength');
  function update(e){
    const val = e.target.value || '';
    if (!out) return;
    if (val.length === 0){ out.textContent = ''; return }
    const ok = validatePasswordStrength(val, $('u-role') ? $('u-role').value : 'cashier');
    out.textContent = ok ? 'Kekuatan: OK' : 'Kekuatan: Lemah';
    out.style.color = ok ? 'green' : 'orangered';
  }
  if (p1) p1.addEventListener('input', update);
  if (p2) p2.addEventListener('input', update);
}


start();
