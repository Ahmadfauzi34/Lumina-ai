# Architecture & Codebase Guidelines

Dokumen ini adalah panduan bagi developer (baik AI maupun manusia, khususnya pemula) untuk memahami bagaimana aplikasi ini dibangun, agar codebase tetap aman, mudah di-maintain, dan terhindar dari bug regresi.

## 1. Struktur Folder (Domain-Driven / Feature-Based)

Meskipun saat ini banyak file berada di root `src/app`, kita secara bertahap bermigrasi ke struktur yang lebih rapi:

- `src/app/core/`
  Tempat untuk singleton services (misalnya `db.service.ts`, `gemini.service.ts`), Guards, Interceptors, dan Models global.
- `src/app/shared/`
  Tempat untuk komponen yang digunakan berulang-ulang di berbagai tempat (misalnya `chat-message.component.ts`, `markdown-renderer.ts`, pipes, dan directives).
- `src/app/features/`
  Tempat untuk modul atau fitur spesifik aplikasi (misalnya chat interface, agent monitoring).
- `src/app/agent/`
  Core logic dari AI Agent Orchestrator. Semua yang berhubungan dengan state management agen, *Structure of Arrays* (SoA), dan pipeline eksekusi berada di sini.

## 2. Paradigma "Structure of Arrays" (SoA)

Aplikasi ini menggunakan **Structure of Arrays (SoA)** untuk *Agent State Management* alih-alih *Array of Structs* (AoS).
- **Alasan:** SoA lebih ramah memori (cache-friendly), sangat cepat untuk operasi filter/agregasi data paralel, dan mencegah *object reference mutation* (bug yang sering terjadi di Angular/React karena referensi memori tidak berubah).
- **Implementasi:** State tidak disimpan sebagai `Array<{ id, name, status }>` melainkan sebagai `{ ids: [], names: [], statuses: [] }`.
- **Aturan Pemula:** **DILARANG** merusak kontrak SoA. Jika Anda perlu menambah field baru pada state, tambahkan array baru pada interface field tersebut (contoh di `AgentWaveField`), lalu pastikan kapasitas array disinkronkan saat `createEmptyField` dan `resizeBuffer` di orchestrator.

## 3. Strict Contracts & Unit Testing (Tiered)

Codebase ini sangat bergantung pada **Unit Test (Vitest)** untuk mengunci kontrak (Contract Testing).
- Setiap kali Anda memperbaiki bug (seperti bug pencegahan pesan ganda di `app.ts` atau fallback API key di `sub-agent-tool.ts`), Anda **wajib** memeriksa dan/atau menambahkan Unit Test di dalam `*.spec.ts`.
- **DILARANG KERAS** menghapus, menonaktifkan, atau mengabaikan Unit Test yang gagal tanpa memperbaiki akar kodenya. Uji coba kontrak (seperti `AgentOrchestrator — INVARIANT & KONTRAK`) dirancang untuk mencegah kerusakan arsitektur fundamental.

## 4. State Management (Angular Signals & Observables)

- **Signals (`@angular/core`)**: Gunakan Signals untuk local state di komponen (UI state yang sinkron).
- **RxJS Observables**: Digunakan untuk state asinkron, event bus (`agentEventBus`), dan aliran data waktu nyata dari Orchestrator (`field$`).
- **Aturan Praktis:** Selalu pastikan komponen Anda aman ketika Observables dihancurkan. Berlangganan menggunakan `async` pipe pada template Angular ketika memungkinkan, agar pembebasan memori (unsubscribe) ditangani secara otomatis.

## 5. Komunikasi Tool & Pyodide (Programmatic Tools)

Aplikasi ini mendesain agen (LLM) bukan sekadar sebagai chatbot, tapi sebagai *closed-system reasoning engine*.
- Agen tidak boleh sekadar meminta data mentah dalam jumlah banyak (yang akan menghancurkan *context window*).
- Jika agen perlu memproses banyak data, agen harus menggunakan tools seperti `execute_python` (Pyodide).
- **Aturan Eksekusi Code:** Pyodide chạy di Web Worker (`pyodide.worker.ts`) menggunakan *system bridge* (`pyodide.service.ts`). Kode Python akan dijalankan secara aman di sisi klien tanpa merusak thread utama antarmuka pengguna (UI).

## Kesimpulan (Checklist Sebelum Commit)
1. Apakah logika ini merusak SoA Array capacity (menimbulkan pola sparse array / ada index yang kosong/undefined)?
2. Apakah perubahan service UI Anda memicu Double Context pada Gemini chat history?
3. Apakah Anda menjalankan `npx vitest run` dan memastikan tidak ada error (termasuk kontrak tier)?
4. Apakah Anda memisahkan masalah (separation of concerns)? Jika file terlalu besar (> 500 baris), bisakah fungsionalitasnya dipisah menjadi helper atau service tersendiri?
