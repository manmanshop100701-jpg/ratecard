/** Data awal Lebak.market: produk contoh + direktori kuliner (statis). */

const PRODUCTS = [
  { cat:'kriya', emoji:'🍯', g:'g-5', name:'Gula Aren Cetak Asli Cimarga', price:35000, stock:40, cond:'baru',
    seller_name:'Aren Lestari', ava:'🌴', ac:'#d9f8ea', verified:1, likes:412, loc:'Cimarga, Lebak', dist:6.2, cod:1, lebak:1, freeship:0,
    descr:'Gula aren murni dari penderes Cimarga, tanpa campuran. 1 kg isi 8 cetak. Manisnya beda, dijamin!' },
  { cat:'elektronik', emoji:'📷', g:'g-4', name:'Kamera Mirrorless Second — Mulus', price:4200000, stock:1, cond:'bekas',
    seller_name:'Rangkas Gadget', ava:'🤖', ac:'#ece7ff', verified:1, likes:342, loc:'Rangkasbitung, Lebak', dist:1.1, cod:1, lebak:1, freeship:0,
    descr:'Pemakaian 1 tahun, shutter count 8rb, fullset box. COD di Rangkas bisa cek sepuasnya!' },
  { cat:'ikan', emoji:'🐠', g:'g-3', name:'Cupang Halfmoon Blue Rim', price:85000, stock:6, cond:'baru',
    seller_name:'Betta Rangkas', ava:'🐟', ac:'#d8f3ff', verified:1, likes:214, loc:'Rangkasbitung, Lebak', dist:2.3, cod:1, lebak:1, freeship:0,
    descr:'Grade A, umur 4 bulan, sehat & agresif. COD bisa pilih ikan langsung di kolam!' },
  { cat:'kriya', emoji:'🧺', g:'g-1', name:'Tas Anyaman Pandan Handmade', price:65000, stock:8, cond:'baru',
    seller_name:'Kriya Leuwidamar', ava:'🧶', ac:'#fff3c4', verified:1, likes:287, loc:'Leuwidamar, Lebak', dist:14.8, cod:1, lebak:1, freeship:0,
    descr:'Anyaman tangan pengrajin Leuwidamar, kuat & rapi. Dukung kriya lokal Lebak! 🌾' },
  { cat:'makanan', emoji:'🥟', g:'g-6', name:'Emping Melinjo Renyah (500gr)', price:28000, stock:25, cond:'baru',
    seller_name:'Dapur Bu Iis', ava:'👩‍🍳', ac:'#fff3c4', verified:0, likes:176, loc:'Warunggunung, Lebak', dist:7.4, cod:1, lebak:1, freeship:0,
    descr:'Emping asli buatan rumah, digoreng pas pesan biar renyah. Varian original & pedas manis.' },
  { cat:'jasa', emoji:'🎬', g:'g-2', name:'Jasa Edit Video Reels/TikTok', price:150000, stock:99, cond:'baru',
    seller_name:'MONGG.studio', ava:'🎨', ac:'#ffe0ec', verified:1, likes:128, loc:'Online', dist:0, cod:0, lebak:1, freeship:0,
    descr:'Editing rapi, subtitle otomatis, backsound kekinian. Pengerjaan 2-3 hari. Karya anak Lebak! 🌾' },
  { cat:'elektronik', emoji:'⌨️', g:'g-3', name:'Keyboard Mechanical — Like New', price:380000, stock:1, cond:'bekas',
    seller_name:'Rakit Cibadak', ava:'🔧', ac:'#d8f3ff', verified:0, likes:265, loc:'Cibadak, Lebak', dist:4.2, cod:1, lebak:1, freeship:0,
    descr:'Baru pakai 2 bulan. Switch red, keycap PBT, dus lengkap. Nego tipis, COD sekitar Cibadak.' },
  { cat:'fashion', emoji:'🧥', g:'g-2', name:'Jaket Denim Vintage — Second', price:120000, stock:1, cond:'bekas',
    seller_name:'Thrift Maja', ava:'🧢', ac:'#fff3c4', verified:0, likes:159, loc:'Maja, Lebak', dist:17.6, cod:1, lebak:1, freeship:0,
    descr:'Size L, no defect, washed sempurna. COD stasiun Maja oke. First pay first get!' },
  { cat:'ikan', emoji:'🦐', g:'g-5', name:'Udang Red Cherry (10 ekor)', price:50000, stock:12, cond:'baru',
    seller_name:'Aquascape Kalanganyar', ava:'🌿', ac:'#d9f8ea', verified:0, likes:73, loc:'Kalanganyar, Lebak', dist:3.8, cod:1, lebak:1, freeship:0,
    descr:'Warna merah pekat, cocok untuk aquascape. Bonus moss. Ambil sendiri lebih aman untuk udangnya!' },
  { cat:'makanan', emoji:'🍌', g:'g-1', name:'Sale Pisang Asap Khas Lebak', price:22000, stock:30, cond:'baru',
    seller_name:'Oleh-oleh Sajira', ava:'🍯', ac:'#ffe0ec', verified:1, likes:198, loc:'Sajira, Lebak', dist:12.1, cod:1, lebak:1, freeship:0,
    descr:'Sale pisang diasap tradisional, manis legit tanpa pengawet. Oleh-oleh wajib Lebak!' },
  { cat:'elektronik', emoji:'🎧', g:'g-4', name:'TWS Earbuds ANC — Baru Segel', price:299000, stock:23, cond:'baru',
    seller_name:'Serang Elektronik', ava:'🔌', ac:'#ece7ff', verified:1, likes:188, loc:'Kota Serang', dist:38, cod:0, lebak:0, freeship:0,
    descr:'Baru & bersegel, garansi resmi 1 tahun. ANC, baterai 30 jam, BT 5.3.' },
  { cat:'fashion', emoji:'👟', g:'g-1', name:'Sepatu Lari Second — 8/10', price:250000, stock:1, cond:'bekas',
    seller_name:'Sneakers Jakarta', ava:'🏃', ac:'#d9f8ea', verified:0, likes:87, loc:'Jakarta Selatan', dist:92, cod:0, lebak:0, freeship:0,
    descr:'Size 42, dipakai 5x, sol masih tebal. Kirim-kirim aja ya, jauh soalnya.' },
  { cat:'ikan', emoji:'🐟', g:'g-3', name:'Channa Maru Yellow Sentarum', price:450000, stock:2, cond:'baru',
    seller_name:'Borneo Fish Farm', ava:'🎣', ac:'#d9f8ea', verified:1, likes:301, loc:'Pontianak, Kalbar', dist:1100, cod:0, lebak:0, freeship:1,
    descr:'Channa maru 18-20 cm. Kirim antar pulau aman: packing oksigen + styrofoam + garansi hidup. GRATIS ONGKIR!' },
];

const RESTOS = [
  { id:1, name:'Kedai Kopi Multatuli', type:'Coffeeshop', emoji:'☕', g:'g-4', dist:0.8, rating:4.7,
    addr:'Jl. Multatuli No. 12, Rangkasbitung', open:'08.00 – 22.00', wifi:true,
    menu:[['Es Kopi Gula Aren Lebak',15000],['Kopi Susu Reguler',13000],['Americano',12000],['Matcha Latte',18000],['Croffle Original',18000],['Pisang Goreng Wijen',12000],['Teh Tarik',10000]] },
  { id:2, name:'Warung Angeun Lada Bu Enah', type:'Warung', emoji:'🍲', g:'g-6', dist:1.4, rating:4.8,
    addr:'Ps. Rangkasbitung Blok C, Rangkasbitung', open:'07.00 – 15.00', wifi:false,
    menu:[['Angeun Lada + Nasi (khas Lebak!)',18000],['Nasi Timbel Komplit',20000],['Pepes Ikan Mas',15000],['Sayur Asem',8000],['Es Teh Manis',5000],['Es Kelapa Muda',10000]] },
  { id:3, name:'Saung Sawah Resto', type:'Resto', emoji:'🍛', g:'g-5', dist:3.6, rating:4.6,
    addr:'Jl. Raya Cipanas KM 4, Kalanganyar', open:'10.00 – 21.00', wifi:true,
    menu:[['Nasi Liwet Komplit (2-3 org)',65000],['Ayam Bakar Madu',28000],['Gurame Goreng Terbang',55000],['Karedok',15000],['Sambal Dadak + Lalapan',10000],['Es Jeruk Peras',8000]] },
  { id:4, name:'Halte 27 Coffee & Space', type:'Coffeeshop', emoji:'🎧', g:'g-2', dist:2.2, rating:4.5,
    addr:'Jl. RT Hardiwinangun No. 27, Rangkasbitung', open:'10.00 – 23.00', wifi:true,
    menu:[['Kopi Susu Halte',15000],['V60 Beans Lokal Banten',20000],['Red Velvet',18000],['Kentang Goreng Truffle',20000],['Indomie Kuah Telor Keju',15000],['Lemon Tea',12000]] },
  { id:5, name:'Bakso & Mie Ayam Mas Yono', type:'Warung', emoji:'🍜', g:'g-1', dist:1.9, rating:4.6,
    addr:'Jl. Tirtayasa (dekat alun-alun), Rangkasbitung', open:'09.00 – 21.00', wifi:false,
    menu:[['Bakso Urat Jumbo',18000],['Bakso Biasa',13000],['Mie Ayam Bakso',16000],['Mie Ayam Ceker',15000],['Es Jeruk',6000],['Kerupuk',2000]] },
  { id:6, name:'Kopi Kebon Baduy View', type:'Cafe', emoji:'🌄', g:'g-3', dist:13.5, rating:4.9,
    addr:'Jl. Raya Ciboleger, Leuwidamar (arah Baduy)', open:'09.00 – 20.00', wifi:true,
    menu:[['Kopi Tubruk Aren',12000],['Kopi Susu Kebon',16000],['Madu Hutan Lemon Hangat',18000],['Singkong Goreng Sambal Roa',15000],['Nasi Goreng Kampung',22000],['Mendoan (5 pcs)',12000]] },
];

function seedProducts(db){
  const n = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (n > 0) return;
  const ins = db.prepare(`INSERT INTO products
    (seller_id, seller_name, ava, ac, verified, cat, name, price, stock, cond, loc, dist, cod, freeship, lebak, emoji, g, likes, descr, created_at)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = Date.now();
  PRODUCTS.forEach((p, i) => ins.run(
    p.seller_name, p.ava, p.ac, p.verified, p.cat, p.name, p.price, p.stock, p.cond,
    p.loc, p.dist, p.cod, p.freeship, p.lebak, p.emoji, p.g, p.likes, p.descr, now - i*3600e3
  ));
  console.log(`[seed] ${PRODUCTS.length} produk contoh dimasukkan`);
}

module.exports = { seedProducts, RESTOS };
