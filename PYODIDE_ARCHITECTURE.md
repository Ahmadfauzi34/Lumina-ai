# Dokumen Desain: Arsitektur Agen dengan Programmatic Skills & Context Engineering via Pyodide

Dokumen ini menjelaskan rancangan arsitektur modern untuk ekosistem AI Agent di aplikasi kita. Tujuannya adalah untuk mendobrak batasan *traditional tool-calling* yang rentan terhadap polusi konteks dan memakan waktu (latency tinggi akibat round-trip berulang ke LLM). Sebagai gantinya, agen akan mengandalkan eksekusi *sandboxed* menggunakan **Pyodide** di sisi klien (browser), dengan mengutamakan prinsip performa tinggi (SOA, Web Workers, dan Kernel-style queries).

## 1. Programmatic Tools & Web Worker Isolation

### Konsep Masalah
Pendekatan tradisional: LLM -> Panggil Tool A -> Tunggu Hasil -> LLM -> Panggil Tool B -> Tunggu Hasil. 
Selain lambat, jika kita memindahkan komputasi ini ke klien menggunakan WASM, main thread (UI) bisa mengalami *freeze* jika komputasi memakan waktu lebih dari 50ms.

### Solusi: Web Worker & Python Pipeline
- LLM menulis kode (sebuah rutinitas/program) untuk merespon tugas analitik atau data-heavy.
- Pipeline ini HARUS dijalankan di dalam **Web Worker** tersendiri (`pyodide.worker.ts`), dipisahkan dari Main Thread.
- Komunikasi antara Main Thread dan Worker menggunakan zero-copy passing (`SharedArrayBuffer` atau `Transferable`) untuk menghindari alokasi memori (alloc/copy) di hot path.
- Loop, kondisional, dan manipulasi data murni berjalan di clock-speed CPU klien via WASM.

## 2. Context Engineering & Data Layout (SOA vs AOS)

### Konsep Masalah
Memasukkan ribuan baris data ke context LLM menyebabkan "Lost in the Middle". Memasukkan ribuan objek JSON (AOS - Array of Structs) ke *Pyodide memory* juga memicu tekanan Garbage Collection (GC) dan *memory bloat*.

### Solusi: SOA (Structure of Arrays) & Pre-allocated Buffers
- Hindari *Array of Structs* (List of Dicts di Python). 
- Data dari IndexedDB (Dexie) dikonversi menjadi flat columnar buffer (SOA) - misal `Int32Array` untuk IDs, array string untuk pesan.
- Di dalam Pyodide, manipulasi data memanfaatkan `numpy` arrays (contiguous WASM memory) alih-alih `pandas` DataFrame yang dibangun dari `dict`.
- **HANYA HASIL AKHIR** agregasi yang dilaporkan kembali ke LLM. Context Window diperlakukan sebagai *Budget Limit*.

## 3. Eksekusi Sub-Agent: Menghindari N+1 API Call Trap

### Konsep Masalah
Memanggil agen (LLM) di dalam loop data (contoh: rekursi per 50 baris data di dalam Python) akan menyebabkan *N+1 problem*, latency berlipat ganda, dan API rate limit exhaustion.

### Solusi: Orchestration di Luar Loop & Kernel-style Execution
- **DILARANG** melakukan pemanggilan API LLM di dalam loop Python (`from js import fetch` API LLM). Script Python harus murni melakukan transformasi data, agregasi, atau ekstraksi fitur.
- **Hierarchical Summarization (Opsional):** Python dapat mereduksi data menjadi *tree of summaries*, dan Orchestrator (di sisi JavaScript) yang akan men-spawn sub-agent paralel berdasarkan *output agregat* Python.
- **Continuous Query via Kernel Convolution:** Untuk data historis, Web Worker tidak boleh `fetch all` lalu `filter` di Python. Gunakan *cursor* Dexie (`db.table.where().each()`) untuk streaming query, di mana data mengalir melewati filter tanpa dimuat penuh ke memori secara bersamaan.

## 4. Alur Kerja Sinkronisasi (Orchestrator <-> Pyodide)

1. **User Input:** "Cari bug di seluruh log error bulan lalu, temukan masalah utamanya."
2. **Planner Agent:** Mengerti ini butuh banyak pemrosesan data. Agent menggunakan *Tool* `execute_python`.
3. **Drafting Script (Data Aggregation Only):** 
   ```python
   # Script diharapkan mengembalikan agregasi/pola, bukan memanggil LLM lagi
   import numpy as np

   # Data sudah disiapkan oleh host sebagai arrays (SOA)
   # errors_msg: list of strings, errors_timestamp: numpy array
   
   unique_patterns = extract_patterns(errors_msg) # Contoh fungsi internal murni
   
   # Return pure data ke JS host
   result = {"patterns": unique_patterns, "count": len(errors_msg)}
   result # nilai terakhir dikembalikan ke node/host
   ```
4. **Eksekusi & Yielding:** Web Worker mengeksekusi Pyodide secara terisolasi. Jika script butuh data, ini difasilitasi lewat Web Worker boundary (bukan block wait).
5. **Orkestrasi Sub-Agent (Jika Perlu):** JS Main Thread menerima daftar pola *unik*. Jika dirasa perlu pendalaman LLM, Main Thread me-loop pola tersebut dan me-dispatch sub-agen *secara paralel*.
6. **Output Final:** Konteks terjaga bersih, performa tetap tinggi.

## 5. Ringkasan Action Items untuk Implementasi

| Komponen | Implementasi Terkini / Harapan | Status / Prinsip |
| :--- | :--- | :--- |
| **Execution Thread** | `pyodide.worker.ts` & `execute-code.worker.ts` sudah ada | Web Worker Wajib, mencegah *UI freeze*. |
| **Data Layout** | Harus beralih dari JSON Array (AOS) | Pakai SOA (Columnar buffer, `numpy` ready). |
| **Filtering** | Tidak memuat semua data ke Python seketika | *Kernel-style*: filter di JS/Dexie cursor, Python terima hasil streaming/aggregate. |
| **Sub-Agent Calls** | Tidak di dalam loop skrip Python! | Python = Transformasi murni. Orchestrasi + LLM = JS Host (Luar WASM). |
| **Memory Buffer** | Typed buffer reuse | Swap-drop array, *no allocation* saat hot path. |
| **Rust / WASM (Future)**| Jika Pyodide lambat untuk data > 100k baris | Susun modul Rust native untuk parsing berat dan lewatkan Data ke JS. |

