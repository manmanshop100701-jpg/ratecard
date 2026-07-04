/**
 * Direktori kuliner Lebak (data editorial, bukan postingan pengguna).
 * Produk TIDAK di-seed lagi — feed 100% berisi postingan pengguna asli.
 */
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

module.exports = { RESTOS };
