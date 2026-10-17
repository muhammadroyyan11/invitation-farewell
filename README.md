# Farewell Asik Royyan

Halaman utama langsung menampilkan form konfirmasi kehadiran dengan input nama dan pilihan hadir, menyusul setelah shift 2, atau tidak bisa hadir. Tersedia kolom pesan dan kesan untuk Royyan yang bersifat opsional, maksimal 500 karakter; pesan bisa diperbarui dan dilihat di rekap panitia. Informasi farewell ditampilkan singkat di atas form, tanpa halaman undangan panjang. Rekap khusus panitia tetap tersedia. Dibuat dengan Node.js dan HTML/CSS/JavaScript tanpa dependensi tambahan.

## Jalankan

Gunakan Node.js 20 atau lebih baru:

```bash
npm start
```

- Undangan: `http://localhost:3000`
- Rekap kehadiran: `http://localhost:3000/admin`
- Pengembangan dengan restart otomatis: `npm run dev`

Undangan menampilkan pukul **19.00**, lokasi **mess**, dan informasi bahwa **shift 2 boleh menyusul**. Tanggal tidak ditampilkan karena belum ditentukan. Teks acara bisa diubah di `public/index.html`.

## Cara melihat konfirmasi kehadiran

1. Jalankan server, lalu buka `/admin` atau klik **Ruang panitia** di bagian bawah undangan.
2. Pada saat pertama dijalankan, server membuat kata sandi acak. Lihat kata sandinya di terminal:

   ```bash
   cat .data/admin-password
   ```

3. Masukkan kata sandi tersebut. Jangan membagikannya kepada tamu.
4. Rekap menampilkan nama, status hadir/menyusul/berhalangan, pesan, dan waktu konfirmasi. Gunakan pencarian nama atau filter status. Rekap otomatis diperbarui setiap 30 detik ketika tab aktif; tombol **Muat ulang rekap** tersedia untuk memperbarui langsung.
5. Klik **Unduh CSV** untuk membuka rekap di Excel atau Google Sheets. Ekspor mencakup semua konfirmasi, bukan hanya hasil filter. Waktu pada CSV menggunakan UTC, sedangkan tabel menggunakan zona waktu perangkat panitia.
6. Klik **Clear participant**, lalu setujui konfirmasi untuk menghapus **semua peserta, konfirmasi, dan pesan**, termasuk yang tidak terlihat karena filter. Hanya panitia yang sudah login dapat melakukannya. Penghapusan tidak dapat dibatalkan; unduh CSV terlebih dahulu jika diperlukan. Tabel dan ringkasan jumlah peserta langsung dikosongkan setelah berhasil.

Tamu tidak perlu login. Setelah mengirim konfirmasi, tamu bisa memperbaruinya dari browser yang sama, tanpa membuat entri baru. Identitas konfirmasi disimpan di localStorage browser; browser lain atau penyimpanan yang dihapus dapat menghasilkan entri baru. Nama yang sama tidak otomatis digabung agar dua orang bernama sama tetap dapat mengisi.

## Penyimpanan dan deployment

Data tersimpan di `.data/responses.json`, bukan hanya di browser. Cadangkan direktori `.data` dan gunakan **volume/disk persisten** ketika deployment. Jangan gunakan filesystem sementara atau beberapa proses server yang menulis berkas data yang sama; aplikasi ini ditujukan untuk satu instance Node.js dengan volume persisten.

Konfigurasi opsional:

```bash
ADMIN_PASSWORD='kata-sandi-kuat-minimal-10-karakter' PORT=3000 npm start
```

- `ADMIN_PASSWORD`: kata sandi panitia minimal 10 karakter. Jika tidak diatur, server menggunakan kata sandi di `.data/admin-password` dan membuatnya secara acak hanya jika berkas belum tersedia.
- `DATA_DIR`: lokasi direktori data persisten. Default `.data` di folder proyek.
- `PORT`: port server, default `3000`.
- `HOST`: alamat bind, default `0.0.0.0`.
- `COOKIE_SECURE=true`: aktifkan saat website disajikan melalui HTTPS agar cookie admin hanya dikirim lewat HTTPS. Jangan aktifkan untuk akses lokal HTTP.

Variabel dibaca dari environment proses; file `.env` tidak dimuat otomatis. Gunakan HTTPS saat dipublikasikan. Session panitia berakhir setelah 8 jam atau ketika server dimulai ulang. Pembatasan percobaan login dan kiriman menggunakan alamat IP koneksi; jika berada di balik reverse proxy, semua tamu dapat berbagi batas IP yang sama. Batasi/atur laju permintaan di reverse proxy untuk penggunaan publik. Nama dan pesan hanya tersedia bagi panitia yang sudah login.

Bagikan alamat website publik, bukan `localhost`, agar tamu bisa mengisi dari perangkat masing-masing. Hosting harus mendukung proses Node.js dan penyimpanan persisten; GitHub Pages atau hosting statis saja tidak menjalankan backend ini.
