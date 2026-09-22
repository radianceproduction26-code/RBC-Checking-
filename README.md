# RBC Check – Metal Sleeve Inspection System (Trial Version)

A high-speed, web-based mobile computer vision application designed for shop-floor proof-of-concept trials to inspect injection-molded plastic parts and verify that all required metal sleeves are present.

Built with **React**, **Vite**, **Tailwind CSS**, **OpenCV.js**, **HTML5 Camera API**, and **Web Audio API**.

---

## 🚀 Key Features

* **Real-Time Computer Vision (OpenCV.js)**: Runs feature detection (ORB), descriptor matching, and RANSAC Homography alignment in the browser to lock onto the plastic part even when rotated $0^\circ-360^\circ$, tilted, or handheld by an operator.
* **Multi-Factor Sleeve Verification**: Analyzes circular metallic specular reflection, brass golden hue, and annular knurled edge contrast to distinguish brass/steel inserts from dark empty plastic mold cavities.
* **Shop-Floor Visual Alerting**:
  * **`PASS`**: Giant high-visibility emerald green banner (`PASS - All 3 Sleeves Present`).
  * **`FAIL`**: Flashing high-visibility red banner (`FAIL - Missing Sleeve Detected`).
  * **HUD Canvas Overlay**: Green circles (`✓`) for present sleeves, pulsing red circles (`✕`) for missing sleeves.
* **Instant Acoustic Alarm**: 880 Hz industrial buzzer tone (Web Audio API) that sounds immediately when any sleeve is missing, repeats every second, and automatically silences once the defect clears.
* **Supervisor Master Setup**:
  * Upload master reference photo or capture live snapshot.
  * Interactive canvas annotation (tap to add, drag to move, slider to resize radius).
  * One-click **Auto-Detect Circles** using OpenCV Hough Circles.
  * Local storage persistence across browser reloads.
* **Virtual Shop Floor Test Bench**:
  * Built-in interactive simulator to test part rotation, translation, handheld shake, and toggle missing sleeves without physical parts.
* **100% Offline & Private**: Zero external cloud or database dependencies; everything runs locally in the browser.

---

## 🛠️ Technology Stack

* **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React
* **Computer Vision**: OpenCV.js (WebAssembly)
* **Audio**: Web Audio API (Native browser synthesized 880 Hz buzzer)
* **Hardware API**: HTML5 `MediaDevices.getUserMedia` (Environment / Rear camera priority)

---

## 📦 Getting Started

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18 or newer)
* npm (v9 or newer)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/nilofarsdentaloasis/RBC-Check.git

# Navigate to project folder
cd RBC-Check

# Install dependencies
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

* **Desktop URL**: `http://localhost:5173/`
* **Mobile / Wi-Fi URL**: `http://<your-ip-address>:5173/`

### 4. Build for Production
```bash
npm run build
```

---

## 📖 Operator & Supervisor Workflow

1. **Start Inspection**: Press **"Start Inspection"** on the bottom bar to open the camera stream.
2. **Align Part**: Point the camera at the plastic component. The system will track orientation and highlight all 3 sleeves.
3. **PASS / FAIL**:
   - If all 3 metal sleeves are present $\rightarrow$ Giant **PASS** banner.
   - If any sleeve is missing $\rightarrow$ Giant **FAIL** banner + repeating acoustic alarm.
4. **Master Setup**: Tap **"Master Setup"** to upload or calibrate a new master reference part.
5. **Virtual Test Bench**: Click **"Virtual Test Bench"** in the header to simulate defects and part movements.

---

## 📄 License
MIT License
