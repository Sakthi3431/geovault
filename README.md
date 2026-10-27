# GeoVault — Frontend-only, local-first edition

GeoVault is a React + Vite application that imports site coordinates from Excel and keeps them in the browser's IndexedDB. It has **no Django backend, no server database, no login API, and no GeoVault data upload**.

## What it does

- Import `.xlsx`, `.xls`, or `.csv` files (first worksheet is used).
- Search by full or partial site name, SAP ID, coordinates, or notes.
- Open coordinates in Google Maps, copy coordinates, or share a map link.
- Add, edit, and delete individual locations.
- Keep recently checked locations on this browser/device.
- Export all saved locations to an Excel backup.
- Import an updated file: rows with a matching SAP ID are updated; rows without SAP IDs are matched by site name + coordinates; otherwise new records are added.
- Responsive layout for desktop and mobile.

## Data storage and privacy

- Imported data is stored in **IndexedDB on the current browser and device**. It normally remains after closing the tab or restarting the device.
- Data is not sent to a GeoVault server. The project has no backend.
- The browser's site data is not encrypted by this app. Someone who can access the unlocked browser/profile may be able to access the records. Use a device lock and do not import data you are not permitted to store.
- Clearing the browser's site data, using incognito/private browsing, switching browser profiles, or using another device may remove or hide the records. Export an Excel backup regularly.
- Data saved on one device does not automatically sync to another device.
- When you press **Open Maps** or **Share**, the coordinate/link is sent to or shared with the destination you select (for example Google Maps). The import itself is local.
- The app is intended for ordinary browser use. Do not use it as the only copy of critical records.

## Run locally on Linux Mint

Install Node.js LTS and npm if they are not installed. From a terminal:

```bash
cd geovault/frontend
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

To test a production build locally:

```bash
npm run build
npm run preview
```

## Host online for free using GitHub + Vercel

### 1. Extract the ZIP

Extract `geovault-frontend-only.zip`. The `frontend` directory is the website project. Keep `geovault_template.xlsx` as your import format guide.

### 2. Upload to GitHub

Create a new empty repository at https://github.com/new. From a terminal, enter the extracted `geovault` folder and run:

```bash
git init
git add .
git commit -m "Create frontend-only GeoVault"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/geovault.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username. No Excel data should be included in the repository; only upload the blank template.

### 3. Deploy on Vercel

1. Open https://vercel.com/ and sign in with GitHub.
2. Select **Add New → Project**, then import the `geovault` repository.
3. Set **Root Directory** to `frontend`.
4. Framework preset: **Vite** (usually detected automatically).
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. No environment variables are required.
8. Select **Deploy**.

Vercel will provide a URL like `https://your-project.vercel.app`. Open it over HTTPS on your phone and import the Excel file once. On that same browser and website URL, it should remain available until you clear that site's browser data or the browser removes its stored data.

**Important:** Browser storage is tied to the exact website origin. If you switch from a Vercel preview URL to a different production URL or custom domain, the new URL will have a separate empty library. Choose the final URL and keep using it. Data also does not sync between phone and laptop.

## Excel columns

The first row should contain these headings (case-insensitive):

- `site_name` — required
- `sap_id` — optional
- `latitude` — required, from -90 to 90
- `longitude` — required, from -180 to 180
- `description` — optional

Use the included `geovault_template.xlsx` file as the template. A copy is included at `frontend/public/geovault_template.xlsx` and is available from the website toolbar as **Template**.

## Troubleshooting

- **Import shows no rows:** Ensure the first worksheet has headers in row 1 and data starts in row 2.
- **Data seems missing:** Check that you are on the same browser, profile, and exact website URL. Check whether browser site data was cleared.
- **Need to move devices:** Export Excel from the old device, then import it on the new device.
- **No server/database required:** You do not need Render, Django, PostgreSQL, API URLs, or environment variables for this edition.
