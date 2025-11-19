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
    seedDemo();
    persistDb();
  }
}

function createSchema(){
  db.exec(`
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

function seedDemo(){
  // small demo data for testing
  const demo = [
    ['8901234567897','Sabun Mandi',12000,50,'Kesehatan'],
    ['8901234567898','Sikat Gigi',8000,30,'Kesehatan'],
    ['8901234567890','Minuman A',5000,100,'Minuman']
  ];
  const stmt = db.prepare('INSERT OR REPLACE INTO products VALUES (?,?,?,?,?)');
  demo.forEach(r=>{stmt.run(r)});
  stmt.free();
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
  $('role-cashier').addEventListener('click',()=>switchRole('cashier'));
  $('role-admin').addEventListener('click',()=>switchRole('admin'));
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
}

function switchRole(r){
  role = r;
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  if (r==='cashier') $('cashier-page').classList.remove('hidden');
  else $('admin-page').classList.remove('hidden');
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
  // Register service worker for offline support
  if ('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('/service-worker.js'); console.log('SW registered'); }
    catch(err){ console.warn('SW register failed', err); }
  }
}

start();
