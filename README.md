# Kraepelin Practice — GitHub Pages

Platform latihan Tes Kraepelin berbasis HTML/CSS/JavaScript, tanpa login dan tanpa backend.

## Format latihan
- 50 kolom
- 26 soal per kolom
- 27 digit per kolom → menghasilkan 26 pasangan penjumlahan
- 15 detik per kolom
- Total waktu maksimum: 12 menit 30 detik
- Arah pengerjaan: dari bawah ke atas
- Jawaban: angka satuan dari hasil penjumlahan
- Angka baru dibuat secara acak setiap kali tes baru dimulai

> Format ini adalah salah satu format latihan Kraepelin. Format dan norma resmi dapat berbeda menurut psikolog, biro psikologi, atau perusahaan yang menyelenggarakan tes.

## Fitur

### 1. Responsive UI
Tampilan menyesuaikan:
- Handphone
- Tablet
- Laptop
- Monitor desktop

### 2. Timer otomatis
Setiap kolom memiliki waktu 15 detik. Ketika waktu habis, sistem otomatis pindah ke kolom berikutnya.

Jika peserta menyelesaikan 26 soal lebih cepat dari 15 detik, aplikasi langsung pindah ke kolom berikutnya sesuai requirement platform ini.

### 3. Anti-hilang saat tidak sengaja refresh
Saat tes aktif, state berikut disimpan sementara di `localStorage`:
- Angka soal
- Jawaban yang sudah dimasukkan
- Kolom aktif
- Soal aktif
- Waktu mulai kolom
- Waktu mulai tes

Karena timer menggunakan timestamp, refresh tidak mereset timer. Saat halaman dibuka kembali, aplikasi menghitung waktu yang sudah berlalu dan melanjutkan dari posisi yang benar.

### 4. Hasil tidak dipersistenkan
Begitu tes selesai:
- active-test storage langsung dihapus
- hasil hanya berada di memory halaman
- refresh pada halaman hasil tidak dapat memulihkan hasil
- tombol Download PDF menjadi cara untuk menyimpan hasil

### 5. Empat indikator latihan
Aplikasi menghitung empat metrik internal:
- Kecepatan
- Ketelitian
- Konsistensi
- Ketahanan

Metrik tersebut adalah **indikator latihan buatan aplikasi**, bukan norma psikometri resmi.

Rumus internal:
- Kecepatan = total dijawab / 1.300 × 100
- Ketelitian = benar / total dijawab × 100
- Konsistensi = 100 − coefficient of variation × 100, dibatasi 0–100
- Ketahanan = penalti terhadap penurunan produktivitas di bagian akhir tes dibanding baseline awal/tengah

### 6. PDF
Hasil dapat diekspor ke PDF menggunakan jsPDF dari CDN jsDelivr.

## Struktur

```text
kraepelin-practice/
├── index.html
├── styles.css
├── app.js
└── README.md
```

## Jalankan

Buka `index.html` menggunakan browser modern.

## GitHub Pages

1. Buat repository baru di GitHub.
2. Upload `index.html`, `styles.css`, `app.js`, dan `README.md` ke root repository.
3. Buka **Settings → Pages**.
4. Pilih deployment dari branch utama/root.
5. Simpan dan buka URL GitHub Pages.

## Catatan teknis

Aplikasi ini sengaja tidak memakai backend. Semua proses tes dan scoring berlangsung di browser.

`localStorage` hanya digunakan untuk menyelamatkan **tes yang sedang aktif** agar refresh tidak menghapus progress. Storage tersebut dihapus saat tes selesai.

Hasil akhir tidak disimpan ke `localStorage`, `sessionStorage`, database, atau akun pengguna.
