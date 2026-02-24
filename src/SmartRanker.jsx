import { useState, useMemo } from "react";

const NUM_BLOCKS = 9;

const SPECIALTIES = [
  "Surgery", "Obstetrics/Gynecology", "Family Medicine", "Psychiatry",
  "Internal Medicine", "Emergency Medicine", "Pediatrics", "Elective",
];

const CITIES = [
  "Akron", "Eastern Cleveland", "Western Cleveland", "Youngstown",
  "Columbus", "Canton", "Cincinnati",
];

const SPECIALTY_COLORS = {
  Surgery: "#8B5CF6", "Obstetrics/Gynecology": "#EC4899",
  "Family Medicine": "#10B981", Psychiatry: "#A16207",
  "Internal Medicine": "#3B82F6", "Emergency Medicine": "#6366F1",
  Pediatrics: "#F59E0B", Elective: "#6B7280",
};

const colorFor = (s) => SPECIALTY_COLORS[s] || "#64748B";

const BLOCK_DATES = {
  1: "Jun 16 – Jul 18", 2: "Jul 21 – Aug 22", 3: "Aug 25 – Sep 26",
  4: "Sep 29 – Oct 31", 5: "Nov 3 – Dec 5", 6: "Dec 8 – Jan 9",
  7: "Jan 12 – Feb 13", 8: "Feb 16 – Mar 20", 9: "Mar 23 – Apr 24",
};

const TIMING_OPTIONS = [
  { value: "early", label: "Early (Blocks 1-3)" },
  { value: "middle", label: "Middle (Blocks 4-6)" },
  { value: "late", label: "Late (Blocks 7-9)" },
  { value: "any", label: "No preference" },
];

const ROTATIONS_WITH_SITES = [
  "Surgery", "Obstetrics/Gynecology", "Family Medicine", "Psychiatry",
  "Internal Medicine", "Emergency Medicine", "Pediatrics",
];

function getRotationSites(schedules) {
  const rotSites = {};
  for (const r of schedules) {
    for (let i = 1; i <= NUM_BLOCKS; i++) {
      const rot = (r[`Block ${i} Rotation`] || "").trim();
      const site = (r[`Block ${i} Site`] || "").trim();
      if (!rot || !site || site === "Generic Elective") continue;
      if (!rotSites[rot]) rotSites[rot] = new Set();
      rotSites[rot].add(site);
    }
  }
  const result = {};
  for (const rot of Object.keys(rotSites)) {
    result[rot] = [...rotSites[rot]].sort();
  }
  return result;
}

// ─── Scoring Engine ──────────────────────────────────────────────────────────
function scoreSchedule(schedule, prefs) {
  let score = 0;
  let maxScore = 0;

  const blocks = [];
  for (let i = 1; i <= NUM_BLOCKS; i++) {
    blocks.push({
      num: i,
      rotation: (schedule[`Block ${i} Rotation`] || "").trim(),
      site: (schedule[`Block ${i} Site`] || "").trim(),
    });
  }

  // 1. City preference (weight: 30)
  if (prefs.preferredCities.length > 0) {
    maxScore += 30;
    const city = (schedule["Dominant City"] || "").trim();
    if (prefs.preferredCities.includes(city)) score += 30;
  }

  // 2. Rotation timing preferences (weight: 8 each)
  for (const rot of SPECIALTIES) {
    const pref = prefs.rotationTiming[rot];
    if (!pref || pref === "any") continue;
    maxScore += 8;
    const rotBlocks = blocks.filter((b) => b.rotation === rot).map((b) => b.num);
    if (rotBlocks.length === 0) continue;
    const relevantBlock = pref === "early" ? Math.min(...rotBlocks) : pref === "late" ? Math.max(...rotBlocks) : rotBlocks[0];
    const early = [1, 2, 3], middle = [4, 5, 6], late = [7, 8, 9];
    if (pref === "early") { if (early.includes(relevantBlock)) score += 8; else if (middle.includes(relevantBlock)) score += 3; }
    else if (pref === "middle") { if (middle.includes(relevantBlock)) score += 8; else score += 3; }
    else if (pref === "late") { if (late.includes(relevantBlock)) score += 8; else if (middle.includes(relevantBlock)) score += 3; }
  }

  // 3. Pinned rotations (weight: 15 each)
  for (const pin of prefs.pinnedRotations) {
    if (!pin.rotation || !pin.block) continue;
    maxScore += 15;
    const blockData = blocks[pin.block - 1];
    if (blockData && blockData.rotation === pin.rotation) score += 15;
  }

  // 4. Avoid rotation in block (weight: 10 each)
  for (const avoid of prefs.avoidRotations) {
    if (!avoid.rotation || !avoid.block) continue;
    maxScore += 10;
    const blockData = blocks[avoid.block - 1];
    if (!blockData || blockData.rotation !== avoid.rotation) score += 10;
  }

  // 5. Rotation-specific site preferences (weight: 6 each)
  for (const rsp of prefs.rotationSitePrefs) {
    if (!rsp.rotation || !rsp.site || rsp.preference === "neutral") continue;
    maxScore += 6;
    const hasMatch = blocks.some((b) => b.rotation === rsp.rotation && b.site === rsp.site);
    if (rsp.preference === "prefer" && hasMatch) score += 6;
    else if (rsp.preference === "avoid" && !hasMatch) score += 6;
  }

  // 6. OB/GYN before Surgery (weight: 10)
  if (prefs.obgynBeforeSurgery !== "any") {
    maxScore += 10;
    const obBlocks = blocks.filter((b) => b.rotation === "Obstetrics/Gynecology").map((b) => b.num);
    const surgBlocks = blocks.filter((b) => b.rotation === "Surgery").map((b) => b.num);
    if (obBlocks.length > 0 && surgBlocks.length > 0) {
      const ob = Math.min(...obBlocks), surg = Math.min(...surgBlocks);
      if (prefs.obgynBeforeSurgery === "yes" && ob < surg) score += 10;
      else if (prefs.obgynBeforeSurgery === "yes" && Math.abs(ob - surg) <= 1) score += 3;
      else if (prefs.obgynBeforeSurgery === "no" && surg < ob) score += 10;
      else if (prefs.obgynBeforeSurgery === "no" && Math.abs(surg - ob) <= 1) score += 3;
    }
  }

  // 7. Surgery before EM (weight: 10)
  if (prefs.surgeryBeforeEM !== "any") {
    maxScore += 10;
    const surgBlocks = blocks.filter((b) => b.rotation === "Surgery").map((b) => b.num);
    const emBlocks = blocks.filter((b) => b.rotation === "Emergency Medicine").map((b) => b.num);
    if (surgBlocks.length > 0 && emBlocks.length > 0) {
      const surg = Math.min(...surgBlocks), em = Math.min(...emBlocks);
      if (prefs.surgeryBeforeEM === "yes" && surg < em) score += 10;
      else if (prefs.surgeryBeforeEM === "yes" && Math.abs(surg - em) <= 1) score += 3;
      else if (prefs.surgeryBeforeEM === "no" && em < surg) score += 10;
      else if (prefs.surgeryBeforeEM === "no" && Math.abs(em - surg) <= 1) score += 3;
    }
  }

  if (maxScore === 0) return 50;
  return Math.round((score / maxScore) * 100);
}

// ─── Helper components ───────────────────────────────────────────────────────
function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function TimingPicker({ rotation, value, onChange }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex items-center gap-2 w-44 flex-shrink-0">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorFor(rotation) }} />
        <span className="text-xs font-semibold text-slate-700">{rotation}</span>
      </div>
      <div className="flex gap-1.5">
        {TIMING_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(rotation, opt.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
              value === opt.value
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  const bg = score >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : score >= 60 ? "bg-blue-100 text-blue-700 border-blue-200"
    : score >= 40 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-[11px] font-bold border ${bg}`}>
      {score}
    </span>
  );
}

function OrderingQuestion({ title, subtitle, optionA, optionB, value, onChange }) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="flex gap-2">
        {[
          { val: "yes", label: optionA },
          { val: "no", label: optionB },
          { val: "any", label: "No preference" },
        ].map((opt) => (
          <button
            key={opt.val}
            onClick={() => onChange(opt.val)}
            className={`flex-1 px-3 py-2.5 rounded-xl text-center border transition-all ${
              value === opt.val
                ? "bg-blue-50 border-blue-300 shadow-sm"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className={`text-xs font-semibold ${value === opt.val ? "text-blue-700" : "text-slate-700"}`}>
              {opt.label}
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SmartRanker({ schedules, onApplyRankList, onBack }) {
  const [prefs, setPrefs] = useState({
    preferredCities: [],
    rotationTiming: {},
    pinnedRotations: [],
    avoidRotations: [],
    rotationSitePrefs: [],
    obgynBeforeSurgery: "any",
    surgeryBeforeEM: "any",
  });

  const [showResults, setShowResults] = useState(false);
  const [selectedCount, setSelectedCount] = useState(30);
  const [expandedRotation, setExpandedRotation] = useState(null);

  const rotationSites = useMemo(() => getRotationSites(schedules), [schedules]);

  const updatePref = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));

  const toggleCity = (city) => {
    setPrefs((p) => {
      const cities = p.preferredCities.includes(city)
        ? p.preferredCities.filter((c) => c !== city) : [...p.preferredCities, city];
      return { ...p, preferredCities: cities };
    });
  };

  const setRotTiming = (rot, val) => {
    setPrefs((p) => ({ ...p, rotationTiming: { ...p.rotationTiming, [rot]: val } }));
  };

  const addPinnedRotation = () => {
    setPrefs((p) => ({ ...p, pinnedRotations: [...p.pinnedRotations, { rotation: "", block: "" }] }));
  };
  const updatePinned = (idx, field, val) => {
    setPrefs((p) => {
      const pins = [...p.pinnedRotations];
      pins[idx] = { ...pins[idx], [field]: field === "block" ? parseInt(val) || "" : val };
      return { ...p, pinnedRotations: pins };
    });
  };
  const removePinned = (idx) => {
    setPrefs((p) => ({ ...p, pinnedRotations: p.pinnedRotations.filter((_, i) => i !== idx) }));
  };

  const addAvoidRotation = () => {
    setPrefs((p) => ({ ...p, avoidRotations: [...p.avoidRotations, { rotation: "", block: "" }] }));
  };
  const updateAvoid = (idx, field, val) => {
    setPrefs((p) => {
      const avoids = [...p.avoidRotations];
      avoids[idx] = { ...avoids[idx], [field]: field === "block" ? parseInt(val) || "" : val };
      return { ...p, avoidRotations: avoids };
    });
  };
  const removeAvoid = (idx) => {
    setPrefs((p) => ({ ...p, avoidRotations: p.avoidRotations.filter((_, i) => i !== idx) }));
  };

  const setRotationSitePref = (rotation, site, preference) => {
    setPrefs((p) => {
      const existing = p.rotationSitePrefs.filter((r) => !(r.rotation === rotation && r.site === site));
      if (preference === "neutral") return { ...p, rotationSitePrefs: existing };
      return { ...p, rotationSitePrefs: [...existing, { rotation, site, preference }] };
    });
  };

  const getRotSitePref = (rotation, site) => {
    const found = prefs.rotationSitePrefs.find((r) => r.rotation === rotation && r.site === site);
    return found ? found.preference : "neutral";
  };

  const scoredSchedules = useMemo(() => {
    return schedules.map((s) => ({ schedule: s, score: scoreSchedule(s, prefs) })).sort((a, b) => b.score - a.score);
  }, [schedules, prefs]);

  const handleApply = () => {
    const topN = scoredSchedules.slice(0, selectedCount).map((s) => s.schedule);
    onApplyRankList(topN);
  };

  const hasPrefs =
    prefs.preferredCities.length > 0 ||
    Object.values(prefs.rotationTiming).some((v) => v && v !== "any") ||
    prefs.pinnedRotations.some((p) => p.rotation && p.block) ||
    prefs.avoidRotations.some((a) => a.rotation && a.block) ||
    prefs.rotationSitePrefs.length > 0 ||
    prefs.obgynBeforeSurgery !== "any" ||
    prefs.surgeryBeforeEM !== "any";

  // ── Results View ───────────────────────────────────────────────────────────
  if (showResults) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">Smart Rank Results</h2>
            <p className="text-xs text-slate-400 mt-0.5">{schedules.length} schedules scored and ranked by your preferences</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowResults(false)} className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
              Edit Preferences
            </button>
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
              <label className="text-xs text-slate-500 font-medium">Add top</label>
              <select value={selectedCount} onChange={(e) => setSelectedCount(parseInt(e.target.value))} className="text-xs font-semibold text-slate-700 bg-transparent border-none focus:outline-none">
                {[10, 20, 30, 50, 100, 207].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
              <span className="text-xs text-slate-500">to rank list</span>
            </div>
            <button onClick={handleApply} className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all">
              Apply to Rank List
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-4 text-xs">
            <span className="font-semibold text-slate-600">Score distribution:</span>
            <span className="text-emerald-600 font-bold">80+: {scoredSchedules.filter((s) => s.score >= 80).length}</span>
            <span className="text-blue-600 font-bold">60-79: {scoredSchedules.filter((s) => s.score >= 60 && s.score < 80).length}</span>
            <span className="text-amber-600 font-bold">40-59: {scoredSchedules.filter((s) => s.score >= 40 && s.score < 60).length}</span>
            <span className="text-slate-500 font-bold">&lt;40: {scoredSchedules.filter((s) => s.score < 40).length}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-500" style={{ width: "40px" }}>Rank</th>
                  <th className="px-2 py-2.5 text-center font-semibold text-slate-500" style={{ width: "45px" }}>Score</th>
                  <th className="px-1 py-2.5 text-center font-semibold text-slate-500" style={{ width: "36px" }}>#</th>
                  <th className="px-1 py-2.5 text-center font-semibold text-slate-500" style={{ width: "70px" }}>City</th>
                  {Array.from({ length: NUM_BLOCKS }, (_, i) => (
                    <th key={i} className="px-0.5 py-2.5 text-center font-semibold text-slate-500">
                      <div className="text-[10px]">Block {i + 1}</div>
                      <div className="text-[8px] font-normal text-slate-400">{BLOCK_DATES[i + 1]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scoredSchedules.map(({ schedule: r, score }, rank) => {
                  const id = String(r.Schedule).trim();
                  const isInTop = rank < selectedCount;
                  return (
                    <tr key={id} className={`transition-colors ${isInTop ? "hover:bg-blue-50/30" : "opacity-40 hover:opacity-70"}`}>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`text-[11px] font-bold ${isInTop ? "text-blue-600" : "text-slate-400"}`}>{rank + 1}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center"><ScoreBadge score={score} /></td>
                      <td className="px-1 py-1.5 text-center font-bold text-slate-700 text-[11px]">{id}</td>
                      <td className="px-1 py-1.5 text-center text-slate-600 font-medium text-[10px]">{r["Dominant City"]}</td>
                      {Array.from({ length: NUM_BLOCKS }, (_, i) => {
                        const rot = (r[`Block ${i + 1} Rotation`] || "").trim();
                        const site = (r[`Block ${i + 1} Site`] || "").trim();
                        return (
                          <td key={i} className="px-0.5 py-1.5 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-block rounded-md font-medium text-white text-[10px] px-1.5 py-0.5 leading-tight text-center" style={{ backgroundColor: colorFor(rot) }}>{rot}</span>
                              {site && <span className="text-slate-400 text-[9px] leading-tight block mt-0.5">{site}</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Preferences Form ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">Smart Ranker</h2>
          <p className="text-xs text-slate-400 mt-0.5">Tell us your preferences and we'll score all {schedules.length} schedules for you</p>
        </div>
        <button onClick={onBack} className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Back</button>
      </div>

      {/* Q1: City */}
      <SectionCard title="Which cities do you prefer?" subtitle="Select one or more — schedules in these cities will score higher">
        <div className="flex flex-wrap gap-2">
          {CITIES.map((city) => (
            <button key={city} onClick={() => toggleCity(city)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${prefs.preferredCities.includes(city) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
              {city}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Q2: Rotation Timing */}
      <SectionCard title="When do you want each rotation?" subtitle="For each rotation, pick when you'd ideally have it in the year">
        <div className="space-y-1 divide-y divide-slate-50">
          {SPECIALTIES.map((rot) => (<TimingPicker key={rot} rotation={rot} value={prefs.rotationTiming[rot] || "any"} onChange={setRotTiming} />))}
        </div>
      </SectionCard>

      {/* Q3: OB/GYN before Surgery */}
      <OrderingQuestion title="Do you want OB/GYN before Surgery?" optionA="OB/GYN before Surgery" optionB="Surgery before OB/GYN" value={prefs.obgynBeforeSurgery} onChange={(val) => updatePref("obgynBeforeSurgery", val)} />

      {/* Q4: Surgery before EM */}
      <OrderingQuestion title="Do you want Surgery before Emergency Medicine?"  optionA="Surgery before EM" optionB="EM before Surgery" value={prefs.surgeryBeforeEM} onChange={(val) => updatePref("surgeryBeforeEM", val)} />

      {/* Q5: Pinned rotations */}
      <SectionCard title="Must-have placements" subtitle='Example: "I want Elective in Block 9" — these are strong preferences'>
        {prefs.pinnedRotations.map((pin, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 font-medium">I want</span>
            <select value={pin.rotation} onChange={(e) => updatePinned(idx, "rotation", e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="">Select rotation</option>
              {SPECIALTIES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <span className="text-xs text-slate-500 font-medium">in</span>
            <select value={pin.block} onChange={(e) => updatePinned(idx, "block", e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="">Block</option>
              {Array.from({ length: NUM_BLOCKS }, (_, i) => (<option key={i + 1} value={i + 1}>Block {i + 1} ({BLOCK_DATES[i + 1]})</option>))}
            </select>
            <button onClick={() => removePinned(idx)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ))}
        <button onClick={addPinnedRotation} className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors">+ Add placement</button>
      </SectionCard>

      {/* Q6: Avoid rotation in block */}
      <SectionCard title="Rotations to avoid in specific blocks" subtitle='Example: "I do NOT want Surgery in Block 1" — schedules matching this score lower'>
        {prefs.avoidRotations.map((avoid, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 font-medium">Avoid</span>
            <select value={avoid.rotation} onChange={(e) => updateAvoid(idx, "rotation", e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="">Select rotation</option>
              {SPECIALTIES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <span className="text-xs text-slate-500 font-medium">in</span>
            <select value={avoid.block} onChange={(e) => updateAvoid(idx, "block", e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="">Block</option>
              {Array.from({ length: NUM_BLOCKS }, (_, i) => (<option key={i + 1} value={i + 1}>Block {i + 1} ({BLOCK_DATES[i + 1]})</option>))}
            </select>
            <button onClick={() => removeAvoid(idx)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ))}
        <button onClick={addAvoidRotation} className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors">+ Add avoidance</button>
      </SectionCard>

      {/* Q7: Rotation-specific site preferences */}
      <SectionCard title="Hospital preferences by rotation" subtitle="Click a rotation to expand and set prefer/avoid for each site for that rotation">
        <div className="space-y-1">
          {ROTATIONS_WITH_SITES.map((rot) => {
            const sites = rotationSites[rot] || [];
            const isExpanded = expandedRotation === rot;
            const prefCount = prefs.rotationSitePrefs.filter((r) => r.rotation === rot).length;
            return (
              <div key={rot} className="border border-slate-100 rounded-lg overflow-hidden">
                <button onClick={() => setExpandedRotation(isExpanded ? null : rot)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorFor(rot) }} />
                    <span className="text-xs font-semibold text-slate-700">{rot}</span>
                    <span className="text-[10px] text-slate-400">{sites.length} sites</span>
                    {prefCount > 0 && <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">{prefCount} set</span>}
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100 pt-2">
                    {sites.map((site) => {
                      const current = getRotSitePref(rot, site);
                      return (
                        <div key={site} className="flex items-center justify-between py-0.5">
                          <span className="text-[11px] text-slate-600">{site}</span>
                          <div className="flex gap-1">
                            <button onClick={() => setRotationSitePref(rot, site, current === "prefer" ? "neutral" : "prefer")}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${current === "prefer" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-white text-slate-400 border-slate-200 hover:border-emerald-300"}`}>
                              Prefer
                            </button>
                            <button onClick={() => setRotationSitePref(rot, site, current === "avoid" ? "neutral" : "avoid")}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${current === "avoid" ? "bg-red-100 text-red-700 border-red-300" : "bg-white text-slate-400 border-slate-200 hover:border-red-300"}`}>
                              Avoid
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Generate button */}
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-6 pb-4">
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl shadow-lg p-4">
          <div>
            {hasPrefs ? (
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {[
                    prefs.preferredCities.length > 0 && `${prefs.preferredCities.length} cities`,
                    Object.values(prefs.rotationTiming).filter((v) => v && v !== "any").length > 0 && `${Object.values(prefs.rotationTiming).filter((v) => v && v !== "any").length} timing prefs`,
                    prefs.pinnedRotations.filter((p) => p.rotation && p.block).length > 0 && `${prefs.pinnedRotations.filter((p) => p.rotation && p.block).length} pins`,
                    prefs.avoidRotations.filter((a) => a.rotation && a.block).length > 0 && `${prefs.avoidRotations.filter((a) => a.rotation && a.block).length} avoidances`,
                    prefs.rotationSitePrefs.length > 0 && `${prefs.rotationSitePrefs.length} site prefs`,
                    prefs.obgynBeforeSurgery !== "any" && "OB/GYN ordering",
                    prefs.surgeryBeforeEM !== "any" && "Surgery/EM ordering",
                  ].filter(Boolean).join(" · ")}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">Set at least one preference to get started</p>
            )}
          </div>
          <button onClick={() => setShowResults(true)} disabled={!hasPrefs}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${hasPrefs ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            Generate Rankings
          </button>
        </div>
      </div>
    </div>
  );
}
