import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  MapPin, MapPinned, Search, FileUp, FileDown, Plus, Pencil, Trash2,
  ExternalLink, Share2, Copy, Clock3, Database, ShieldCheck, X, Check,
  AlertCircle, UploadCloud, Trash, Smartphone, Info
} from "lucide-react";

const DB_NAME = "geovault-local-db";
const DB_VERSION = 1;
const STORE = "locations";
const emptyForm = { site_name: "", sap_id: "", latitude: "", longitude: "", description: "" };
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser storage."));
  });
}
async function dbAction(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let request;
    try { request = action(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Browser storage operation failed.")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Browser storage operation was cancelled.")); };
  });
}
const getAllLocations = () => dbAction("readonly", store => store.getAll());
const saveOne = (location) => dbAction("readwrite", store => store.put(location));
const deleteOne = (id) => dbAction("readwrite", store => store.delete(id));
const clearAll = () => dbAction("readwrite", store => store.clear());
const clean = (value) => String(value ?? "").trim();
const mapsUrl = (loc) => `https://www.google.com/maps?q=${encodeURIComponent(`${loc.latitude},${loc.longitude}`)}`;

function App() {
  const [locations, setLocations] = useState([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastImport, setLastImport] = useState("");
  const fileRef = useRef(null);

  async function refresh() {
    try {
      const rows = await getAllLocations();
      setLocations((rows || []).sort((a, b) => a.site_name.localeCompare(b.site_name)));
      setError("");
    } catch (e) {
      setError(`Browser storage is unavailable. Try opening GeoVault in a normal browser tab. ${e.message || ""}`);
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = locations;
    if (view === "recent") rows = rows.filter(row => row.last_checked);
    if (q) rows = rows.filter(row => [row.site_name, row.sap_id, row.latitude, row.longitude, row.description].some(v => String(v ?? "").toLowerCase().includes(q)));
    if (view === "recent") rows = [...rows].sort((a, b) => (b.last_checked || 0) - (a.last_checked || 0));
    return rows;
  }, [locations, query, view]);
  const recentCount = locations.filter(row => row.last_checked).length;

  function startCreate() { setEditing(null); setForm(emptyForm); setError(""); setModal(true); }
  function startEdit(row) {
    setEditing(row);
    setForm({ site_name: row.site_name || "", sap_id: row.sap_id || "", latitude: String(row.latitude), longitude: String(row.longitude), description: row.description || "" });
    setError(""); setModal(true);
  }
  function updateForm(key, value) { setForm(old => ({ ...old, [key]: value })); }

  async function saveLocation(event) {
    event.preventDefault(); setError("");
    const latitude = Number(form.latitude), longitude = Number(form.longitude);
    if (!clean(form.site_name)) return setError("Site name is required.");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return setError("Latitude must be between -90 and 90.");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return setError("Longitude must be between -180 and 180.");
    const row = { ...(editing || {}), id: editing?.id || makeId(), site_name: clean(form.site_name), sap_id: clean(form.sap_id), latitude, longitude, description: clean(form.description), updated_at: Date.now() };
    try {
      await saveOne(row); await refresh(); setModal(false); setNotice(editing ? "Location updated on this device" : "Location saved on this device");
    } catch (e) { setError(`Could not save to browser storage: ${e.message || ""}`); }
  }

  async function removeLocation(row) {
    if (!window.confirm(`Delete “${row.site_name}” from this browser?`)) return;
    try { await deleteOne(row.id); await refresh(); setNotice("Location deleted from this device"); }
    catch (e) { setError(e.message || "Unable to delete location."); }
  }
  async function checkLocation(row) {
    // Open immediately within the click gesture so mobile popup blockers are less likely to block Maps.
    window.open(mapsUrl(row), "_blank", "noopener,noreferrer");
    const updated = { ...row, last_checked: Date.now() };
    try { await saveOne(updated); await refresh(); }
    catch (e) { setError(e.message || "Unable to update recent history."); }
  }
  async function copyText(value, message = "Copied") {
    try { await navigator.clipboard.writeText(value); setNotice(message); }
    catch { window.prompt("Copy this text:", value); }
  }
  async function shareLocation(row) {
    const url = mapsUrl(row);
    if (navigator.share) {
      try { await navigator.share({ title: row.site_name, text: `${row.site_name}${row.sap_id ? ` (${row.sap_id})` : ""}`, url }); }
      catch (e) { if (e?.name !== "AbortError") await copyText(url, "Map link copied"); }
    } else await copyText(url, "Map link copied");
  }

  function validateAndNormalize(raw) {
    const normalized = raw.map((item, index) => {
      if (Object.values(item).every(value => clean(value) === "")) return null;
      const keys = {};
      Object.entries(item).forEach(([key, value]) => { keys[String(key).trim().toLowerCase().replace(/[\s-]+/g, "_")] = value; });
      const site_name = clean(keys.site_name ?? keys.site ?? keys.name);
      const sap_id = clean(keys.sap_id ?? keys.sapid ?? keys.sap);
      const latitude = Number(keys.latitude ?? keys.lat);
      const longitude = Number(keys.longitude ?? keys.lon ?? keys.lng ?? keys.long);
      const description = clean(keys.description ?? keys.notes ?? keys.remark);
      if (!site_name) throw new Error(`Row ${index + 2}: site_name is missing.`);
      if (clean(keys.latitude ?? keys.lat) === "") throw new Error(`Row ${index + 2}: latitude is missing for ${site_name}.`);
      if (clean(keys.longitude ?? keys.lon ?? keys.lng ?? keys.long) === "") throw new Error(`Row ${index + 2}: longitude is missing for ${site_name}.`);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error(`Row ${index + 2}: invalid latitude for ${site_name}.`);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error(`Row ${index + 2}: invalid longitude for ${site_name}.`);
      return { site_name, sap_id, latitude, longitude, description };
    }).filter(Boolean);
    if (!normalized.length) throw new Error("No location rows found. Use the template headings: site_name, sap_id, latitude, longitude, description.");
    return normalized;
  }

  async function importExcel(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setImporting(true); setError("");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an .xlsx, .xls, or .csv file.");
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      const incoming = validateAndNormalize(raw);
      const existing = await getAllLocations();
      const bySap = new Map(existing.filter(r => r.sap_id).map(r => [r.sap_id.toLowerCase(), r]));
      const bySignature = new Map(existing.map(r => [`${r.site_name.toLowerCase()}|${r.latitude}|${r.longitude}`, r]));
      let added = 0, updated = 0;
      for (const item of incoming) {
        const match = (item.sap_id && bySap.get(item.sap_id.toLowerCase())) || bySignature.get(`${item.site_name.toLowerCase()}|${item.latitude}|${item.longitude}`);
        const row = { ...(match || {}), ...item, id: match?.id || makeId(), updated_at: Date.now() };
        await saveOne(row);
        if (match) updated++; else added++;
        if (item.sap_id) bySap.set(item.sap_id.toLowerCase(), row);
        bySignature.set(`${item.site_name.toLowerCase()}|${item.latitude}|${item.longitude}`, row);
      }
      await refresh(); setLastImport(`${file.name} · ${new Date().toLocaleString()}`);
      setNotice(`Import complete: ${added} added, ${updated} updated`);
    } catch (e) { setError(e.message || "Excel import failed."); }
    finally { setImporting(false); event.target.value = ""; }
  }

  function exportExcel() {
    const rows = locations.map(({ site_name, sap_id, latitude, longitude, description }) => ({ site_name, sap_id, latitude, longitude, description }));
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: ["site_name", "sap_id", "latitude", "longitude", "description"] });
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Locations");
    XLSX.writeFile(workbook, "geovault_locations.xlsx"); setNotice("Excel exported to your device");
  }
  async function clearData() {
    if (!window.confirm("This permanently removes all GeoVault locations and recent-check history stored in this browser. Make sure you have a backup Excel file. Continue?")) return;
    try { await clearAll(); setLocations([]); setLastImport(""); setQuery(""); setView("all"); setNotice("All local GeoVault data cleared"); }
    catch (e) { setError(e.message || "Could not clear local data."); }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-200"><MapPinned size={22}/></div><div><div className="font-display text-xl font-extrabold tracking-tight text-slate-900">GeoVault</div><div className="text-[11px] font-medium text-slate-500">Your private, on-device location library</div></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel}/>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={importing}><FileUp size={16}/>{importing ? "Importing…" : "Import Excel"}</button>
          <button className="btn-secondary" onClick={exportExcel} disabled={!locations.length}><FileDown size={16}/> Export</button>
          <a className="btn-secondary hidden sm:inline-flex" href="/geovault_template.xlsx" download><FileDown size={16}/> Template</a>
          <button className="btn-primary" onClick={startCreate}><Plus size={17}/> <span className="hidden sm:inline">Add location</span><span className="sm:hidden">Add</span></button>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-soft sm:p-9">
        <div className="hero-orb orb-one"/><div className="hero-orb orb-two"/>
        <div className="relative z-10 max-w-2xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100"><ShieldCheck size={14}/> PRIVATE BY DESIGN</div>
          <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">Your site coordinates.<br className="hidden sm:block"/> Always ready to search.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Import your Excel once. GeoVault saves the records in this browser on this device, so they're still here next time you visit.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 hover:bg-blue-50"><UploadCloud size={17}/> {locations.length ? "Import / update Excel" : "Import your Excel"}</button><button onClick={() => document.getElementById("location-search")?.focus()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"><Search size={16}/> Search sites</button></div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="stat-card"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Database size={20}/></div><div className="ml-3"><div className="font-display text-2xl font-extrabold text-slate-900">{locations.length}</div><div className="text-xs text-slate-500">Saved locations</div></div></div>
        <div className="stat-card"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Clock3 size={20}/></div><div className="ml-3"><div className="font-display text-2xl font-extrabold text-slate-900">{recentCount}</div><div className="text-xs text-slate-500">Sites checked</div></div></div>
        <div className="stat-card"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Smartphone size={20}/></div><div className="ml-3"><div className="text-sm font-bold text-slate-900">This device only</div><div className="text-xs text-slate-500">Stored in browser IndexedDB</div></div></div>
      </section>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950"><Info size={18} className="mt-0.5 shrink-0 text-blue-600"/><div><b>Your data stays in this browser.</b> It is not uploaded to GeoVault's server. It normally remains after closing the tab or restarting your phone, but clearing this site's browser data, using private/incognito mode, or changing browsers/devices can remove or hide it. Export a backup Excel file regularly.</div></div>

      {error && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} className="mt-0.5 shrink-0"/><div className="min-w-0 flex-1 whitespace-pre-wrap break-words">{error}</div><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16}/></button></div>}
      {notice && <div role="status" className="fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl sm:right-6"><Check size={17} className="text-emerald-400"/>{notice}</div>}

      <section className="mt-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Location library</div><h2 className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">Find a site</h2><p className="mt-1 text-sm text-slate-500">Search by full or partial site name, SAP ID, or coordinates.</p></div><div className="flex gap-2"><button onClick={() => setView("all")} className={`rounded-xl px-3 py-2 text-sm font-semibold ${view === "all" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>All sites</button><button onClick={() => setView("recent")} className={`rounded-xl px-3 py-2 text-sm font-semibold ${view === "recent" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>Recently checked</button></div></div>
        <div className="relative mt-4"><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input id="location-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try a site name or SAP ID…" className="search-input w-full pl-11 pr-10"/>{query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400"><X size={16}/></button>}</div>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{searched.length} {searched.length === 1 ? "result" : "results"}</span>{lastImport && <span className="max-w-[70%] truncate text-right">Last import: {lastImport}</span>}</div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft">
          {loading ? <div className="py-14 text-center text-sm text-slate-500">Loading your browser library…</div> : searched.length === 0 ? <div className="flex flex-col items-center px-5 py-12 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><MapPin size={25}/></div><h3 className="mt-4 font-display font-bold text-slate-800">{query ? "No matching locations" : view === "recent" ? "No sites checked yet" : "Your library is empty"}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{query ? "Try a shorter search or part of an SAP ID." : "Import your Excel file to load your site data. It will stay saved in this browser."}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => fileRef.current?.click()} className="btn-primary"><FileUp size={16}/> Import Excel</button><button onClick={startCreate} className="btn-secondary"><Plus size={16}/> Add manually</button></div></div> : <div className="divide-y divide-slate-100">{searched.map(row => <article key={row.id} className="p-4 transition hover:bg-slate-50/70 sm:p-5"><div className="flex items-start gap-3 sm:gap-4"><div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><MapPin size={20}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold text-slate-900">{row.site_name}</h3>{row.sap_id && <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{row.sap_id}</span>}</div><div className="mt-1.5 break-words font-mono text-xs text-slate-500">{Number(row.latitude).toFixed(6)}, {Number(row.longitude).toFixed(6)}</div>{row.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-500">{row.description}</p>}<div className="mt-3 flex flex-wrap gap-2"><button onClick={() => checkLocation(row)} className="action-primary"><ExternalLink size={14}/> Open Maps</button><button onClick={() => copyText(`${row.latitude}, ${row.longitude}`, "Coordinates copied")} className="action-secondary"><Copy size={14}/> Copy coordinates</button><button onClick={() => shareLocation(row)} className="action-secondary"><Share2 size={14}/> Share</button></div>{row.last_checked && <div className="mt-2 text-[11px] text-slate-400">Last checked {new Date(row.last_checked).toLocaleString()}</div>}</div><div className="flex shrink-0 gap-1"><button aria-label={`Edit ${row.site_name}`} onClick={() => startEdit(row)} className="icon-action"><Pencil size={15}/></button><button aria-label={`Delete ${row.site_name}`} onClick={() => removeLocation(row)} className="icon-action text-rose-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15}/></button></div></div></article>)}</div>}
        </div>
      </section>

      <section className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-rose-100 bg-white p-4 sm:flex-row sm:items-center"><div><div className="text-sm font-bold text-slate-800">Clear local data</div><p className="mt-1 text-xs leading-5 text-slate-500">Removes all saved locations and recent-check history from this browser. Export a backup first if needed.</p></div><button onClick={clearData} disabled={!locations.length} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40"><Trash size={16}/> Clear all data</button></section>
      <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 py-5 text-xs leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} GeoVault · Local-first site finder</span><span>Stored locally with IndexedDB · No GeoVault backend</span></footer>
    </main>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}><div role="dialog" aria-modal="true" aria-labelledby="location-modal-title" className="my-auto w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><div className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">On-device location</div><h2 id="location-modal-title" className="mt-1 font-display text-xl font-extrabold text-slate-900">{editing ? "Edit location" : "Add location"}</h2></div><button onClick={() => setModal(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={19}/></button></div><form onSubmit={saveLocation} className="space-y-4 px-6 py-6"><div><label className="form-label" htmlFor="site_name">Site name *</label><input id="site_name" required maxLength={200} value={form.site_name} onChange={e => updateForm("site_name", e.target.value)} placeholder="e.g. Tiruppur North" className="form-input"/></div><div><label className="form-label" htmlFor="sap_id">SAP ID (optional)</label><input id="sap_id" maxLength={100} value={form.sap_id} onChange={e => updateForm("sap_id", e.target.value)} placeholder="e.g. TUP-ENB-001" className="form-input"/></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="form-label" htmlFor="latitude">Latitude *</label><input id="latitude" required type="number" min="-90" max="90" step="any" value={form.latitude} onChange={e => updateForm("latitude", e.target.value)} placeholder="11.108500" className="form-input"/></div><div><label className="form-label" htmlFor="longitude">Longitude *</label><input id="longitude" required type="number" min="-180" max="180" step="any" value={form.longitude} onChange={e => updateForm("longitude", e.target.value)} placeholder="77.341100" className="form-input"/></div></div><div><label className="form-label" htmlFor="description">Notes (optional)</label><textarea id="description" rows="3" value={form.description} onChange={e => updateForm("description", e.target.value)} placeholder="Optional site details" className="form-input resize-y"/></div>{error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}<div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModal(false)} className="btn-secondary justify-center">Cancel</button><button type="submit" className="btn-primary justify-center"><Check size={17}/>{editing ? "Save changes" : "Save location"}</button></div></form></div></div>}
  </div>;
}
export default App;
