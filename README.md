# Universal Video Player & Audio Compatibility Fixer

A powerful Chromium (Chrome / Brave / Edge) Manifest V3 extension designed to solve audio codec incompatibility (Dolby Digital AC-3, E-AC-3, DDP 5.1, Dual Audio), container restrictions (MKV / MP4), and streaming issues on BDIX / FTP media servers (like Circle FTP) without forcing manual file downloads.

---

## 🌟 Key Features

1. **In-Browser WebAssembly Dolby Audio Decoding:**
   - Real-time client-side demuxing and decoding of proprietary Dolby AC-3 and Enhanced AC-3 (E-AC-3 / DDP 5.1) audio tracks using WebAssembly (`mediabunny` + `@mediabunny/ac3`) and Web Audio API.
   - Dual-Audio track switching (e.g. Hindi AAC 2.0 / English DDP 5.1) directly inside the browser.

2. **1-Click Direct VLC Network Streaming (No Disk Download):**
   - Stream high-bitrate 1080p / 4K movies live in your local VLC media player over BDIX without downloading gigabytes to disk.
   - Powered by a custom Windows protocol handler (`vlc://`) with URL unescape correction.

3. **Smart Media Detection on Circle FTP & Web Streaming Pages:**
   - **Single Movies:** Automatically detects `<video>` streams and injects an in-page action bar right under the player:
     - `▶ Open in Player (Fix Audio)`
     - `⚡ Stream in VLC`
     - `📥 Fast Download (Chrome)`
     - `📋 Copy Link`
   - **TV Series:** Extracts seasons, episodes, and stream links dynamically and opens a full Netflix-style series navigator.

4. **IDM (Internet Download Manager) Auto-Download Bypass:**
   - Appends streaming manifest headers (`ext=stream.m3u8`) and strips `Content-Disposition: attachment` via DeclarativeNetRequest so IDM does not hijack or interrupt video playback with unwanted download pop-ups.

5. **Clean Native Download Manager:**
   - Download episodes or movies with sanitized filenames directly through Chrome's background download manager.

---

## 🚀 Installation & Setup

### 1. Build the Extension
Ensure you have [Node.js](https://nodejs.org/) (v18+) installed.

```bash
# Install dependencies
npm install

# Compile production bundle into dist/
npm run build
```

### 2. Load the Extension in Your Browser
1. Open your browser and navigate to:
   - **Brave:** `brave://extensions`
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click **Load unpacked** (লোড আনপ্যাকড).
4. Select the **`dist`** folder inside this project directory (`d:\Project\Video_Watching\dist`).

---

## ⚡ 1-Time Setup for Direct VLC Streaming

To allow your browser to launch your local desktop VLC Media Player directly when you click **`[⚡ Stream in VLC]`**:

1. In the project folder, locate **`register-vlc.bat`**.
2. Double-click **`register-vlc.bat`** (or right-click `vlc-protocol.reg` and select **Merge**).
3. Click **Yes / OK** when prompted.
4. That's it! Windows now recognizes the `vlc://` protocol and links it directly to `C:\Program Files\VideoLAN\VLC\vlc.exe`.

---

## 🎬 How to Use

### Watching on Circle FTP:
1. Open any movie or series page on Circle FTP (e.g., `new.circleftp.net/content/...`).
2. **For Single Movies:**
   - An in-page action bar will appear directly below the video player.
   - Click **`▶ Open in Player (Fix Audio)`** to watch in the Universal Player with full Dolby sound.
   - Click **`[⚡ Stream in VLC]`** to launch your local VLC player immediately.
3. **For TV Series:**
   - Click the orange floating button **`▶ Open Series Player`** at the bottom right.
   - Select any season and episode from the sidebar.
   - Use the **`🎧 Audio`** button in the player controls to switch between Hindi, English, or Dolby tracks.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Media Engines:**
  - `mediabunny` & `@mediabunny/ac3`: Client-side Matroska (MKV) / MP4 demuxing & AC-3 / E-AC-3 WASM decoding
  - Web Audio API: Multi-channel buffer scheduling & gain processing
  - `hls.js`: Adaptive bitrate HTTP Live Streaming adapter
- **Extension Platform:** Chrome Extensions Manifest V3 (Service Worker, Content Scripts, DeclarativeNetRequest)

---

## 📜 License
MIT License. Free for personal and educational use.
