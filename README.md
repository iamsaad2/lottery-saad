# NEOMED M3 Lottery Helper Tool

A modern React app for NEOMED M3 students to browse, filter, and rank clinical rotation schedules.

---

## Quick Start (Step by Step)

### Prerequisites

You need **Node.js** (version 18+) installed. Download it from [https://nodejs.org](https://nodejs.org) if you don't have it.

To check if you have it:
```bash
node --version
npm --version
```

### 1. Create the project folder

If you haven't already, create a folder somewhere on your computer and put all the project files in it. The folder structure should look like this:

```
neomed-m3-lottery-tool/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── public/
│   └── schedules.csv        <-- YOUR CSV FILE GOES HERE
└── src/
    ├── main.jsx
    ├── App.jsx
    └── index.css
```

### 2. Place your `schedules.csv` in the `public/` folder

Create a `public/` folder inside the project and copy your `schedules.csv` file into it. This is how the app loads the data.

```bash
mkdir public
cp /path/to/your/schedules.csv public/
```

### 3. Install dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

This will download React, Vite, Tailwind CSS, PapaParse, and SheetJS.

### 4. Start the development server

```bash
npm run dev
```

This will start a local server (usually at `http://localhost:5173`). Open that URL in your browser and you're good to go!

### 5. Build for production (for deploying to GitHub Pages, etc.)

```bash
npm run build
```

This creates a `dist/` folder with static files you can deploy anywhere.

---

## Deploying to GitHub Pages

1. Build the project: `npm run build`
2. The output is in the `dist/` folder
3. Push the contents of `dist/` to your `gh-pages` branch, or use a tool like `gh-pages`:

```bash
npm install -D gh-pages
```

Add this to your `package.json` scripts:
```json
"deploy": "gh-pages -d dist"
```

Then run:
```bash
npm run build
npm run deploy
```

If your repo is `username.github.io`, it'll be live at that URL. If it's a project repo like `username.github.io/repo-name`, update `base` in `vite.config.js`:

```js
export default defineConfig({
  plugins: [react()],
  base: '/repo-name/',
})
```

---

## Features

### Original Functionality (preserved)
- Filter schedules by **city**
- Filter by **rotation grid** (uncheck rotations to exclude)
- Filter modes: City Only, Rotation Only, City AND Rotation
- **Hide already ranked** schedules
- **Add schedules** to a personal rank list
- **Reorder** rank list (move up/down)
- **Remove** from rank list
- **Download** rank list as Excel (.xlsx)
- **Upload** a previously saved rank list from Excel
- **Google Maps** link for site locations

### New Improvements
- **Multi-city selection** — click multiple city chips instead of a single dropdown
- **Text search** — search by schedule number or site name
- **Sort options** — sort by Schedule #, travel distance, or city
- **Travel distance badges** — color-coded (green/yellow/red) for quick scanning
- **Collapsible rotation grid** — cleaner UI, show it only when you need it
- **Row-level toggle all** — check/uncheck all blocks for a rotation at once
- **Toast notifications** — non-intrusive feedback for actions
- **Sticky header** — navigation always accessible
- **Responsive design** — works on desktop, tablet, and mobile
- **Clear All** button for rank list
- **Modern UI** — clean Tailwind design, smooth hover states, polished typography

---

## Tech Stack

- **React 18** — UI framework
- **Vite** — build tool (fast dev server & optimized builds)
- **Tailwind CSS 3** — utility-first styling
- **PapaParse** — CSV parsing
- **SheetJS (xlsx)** — Excel read/write

---

## Updating Schedule Data

Simply replace the `public/schedules.csv` file with your new CSV. The format must have these columns:

```
Schedule, Block 1 Rotation, Block 1 Site, Block 2 Rotation, Block 2 Site, ..., Block 9 Rotation, Block 9 Site, Max Pairwise Distance (min), Dominant City
```

No code changes needed — just swap the file and refresh.
