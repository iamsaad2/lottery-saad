import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import SmartRanker from "./SmartRanker.jsx";

// ─── Constants ───────────────────────────────────────────────────────────────
const NUM_BLOCKS = 9;

const CITIES = [
  "Akron",
  "Eastern Cleveland",
  "Western Cleveland",
  "Youngstown",
  "Columbus",
  "Canton",
  "Cincinnati",
];

const SPECIALTIES = [
  "Surgery",
  "Obstetrics/Gynecology",
  "Family Medicine",
  "Psychiatry",
  "Internal Medicine",
  "Emergency Medicine",
  "Pediatrics",
  "Elective",
];

const SPECIALTY_COLORS = {
  Surgery: "#8B5CF6",
  "Obstetrics/Gynecology": "#EC4899",
  "Family Medicine": "#10B981",
  Psychiatry: "#A16207",
  "Internal Medicine": "#3B82F6",
  "Emergency Medicine": "#6366F1",
  Pediatrics: "#F59E0B",
  Elective: "#6B7280",
};

const colorFor = (s) => SPECIALTY_COLORS[s] || "#64748B";

const BLOCK_DATES = {
  1: "Jun 16 – Jul 18",
  2: "Jul 21 – Aug 22",
  3: "Aug 25 – Sep 26",
  4: "Sep 29 – Oct 31",
  5: "Nov 3 – Dec 5",
  6: "Dec 8 – Jan 9",
  7: "Jan 12 – Feb 13",
  8: "Feb 16 – Mar 20",
  9: "Mar 23 – Apr 24",
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ─── Rotation Badge ──────────────────────────────────────────────────────────
function RotationBadge({ rotation, size = "sm" }) {
  if (!rotation) return <span className="text-slate-400 text-xs">—</span>;
  const bg = colorFor(rotation);
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-block rounded-md font-medium text-white leading-tight text-center ${sizeClass}`}
      style={{ backgroundColor: bg }}
    >
      {rotation}
    </span>
  );
}

// ─── Site Label ──────────────────────────────────────────────────────────────
function SiteLabel({ site }) {
  if (!site) return null;
  return <span className="text-slate-400 text-[9px] leading-tight block mt-0.5">{site}</span>;
}

// ─── Block Cell (rotation + site stacked) ────────────────────────────────────
function BlockCell({ rotation, site }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <RotationBadge rotation={rotation} />
      <SiteLabel site={site} />
    </div>
  );
}

// ─── Toggle Chip ─────────────────────────────────────────────────────────────
function ToggleChip({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150",
        active
          ? "text-white border-transparent shadow-sm"
          : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
      )}
      style={active ? { backgroundColor: color || "#3B82F6" } : {}}
    >
      {label}
    </button>
  );
}

// ─── Drop Indicator Line ─────────────────────────────────────────────────────
function DropIndicator({ show }) {
  if (!show) return null;
  return (
    <div className="relative h-0 z-10">
      <div className="absolute left-0 right-0 h-0.5 bg-blue-500 rounded-full" style={{ top: "-1px" }}>
        <div className="absolute -left-1 -top-[3px] w-2 h-2 bg-blue-500 rounded-full" />
        <div className="absolute -right-1 -top-[3px] w-2 h-2 bg-blue-500 rounded-full" />
      </div>
    </div>
  );
}

// ─── Compact Row (for compact view) ──────────────────────────────────────────
function CompactRow({
  item, index, total, selected, locked, onSelect, onToggleLock, onMove, onRemove, onReorder,
  onMoveToTop, onMoveToBottom, dragHandlers, isDragOverTop, isDragOverBottom, isDragging, animatingId,
}) {
  const [editingRank, setEditingRank] = useState(false);
  const [rankInput, setRankInput] = useState("");
  const schedId = String(item.Schedule).trim();
  const isAnimating = animatingId === schedId;

  const handleRankSubmit = () => {
    const newIndex = parseInt(rankInput, 10) - 1;
    if (!isNaN(newIndex) && newIndex >= 0 && newIndex < total && newIndex !== index) {
      onReorder(index, newIndex);
    }
    setEditingRank(false);
    setRankInput("");
  };

  return (
    <>
      <DropIndicator show={isDragOverTop} />
      <div
        {...(locked ? {} : dragHandlers)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 bg-white border rounded-lg transition-all group",
          locked ? "border-amber-200 bg-amber-50/30" : "border-slate-200",
          isDragging ? "opacity-40 scale-[0.98]" : "",
          selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:bg-slate-50",
          isAnimating ? "animate-flash-highlight" : ""
        )}
      >
        {/* Drag handle */}
        <div className={cn("flex-shrink-0", locked ? "text-slate-200 cursor-not-allowed" : "cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500")} title={locked ? "Locked" : "Drag to reorder"}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </div>

        {/* Lock button */}
        <button onClick={(e) => { e.stopPropagation(); onToggleLock(index); }}
          className={cn("p-0.5 rounded flex-shrink-0 transition-colors", locked ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-slate-500")}
          title={locked ? "Unlock position" : "Lock position"}>
          {locked ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>
          )}
        </button>

        {/* Select checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(index)}
          className="w-3.5 h-3.5 accent-blue-500 flex-shrink-0 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Rank badge */}
        {editingRank ? (
          <input
            type="number" autoFocus min={1} max={total} value={rankInput}
            onChange={(e) => setRankInput(e.target.value)}
            onBlur={handleRankSubmit}
            onKeyDown={(e) => { if (e.key === "Enter") handleRankSubmit(); if (e.key === "Escape") { setEditingRank(false); setRankInput(""); } }}
            className="w-10 h-6 rounded border border-blue-400 text-center text-[11px] font-bold text-blue-600 focus:outline-none bg-blue-50"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setEditingRank(true); setRankInput(String(index + 1)); }}
            className="relative flex items-center justify-center w-8 h-6 rounded border-2 border-slate-300 bg-white text-[11px] font-bold text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-text flex-shrink-0 group/rank"
            title="Click to type a rank number"
          >
            {index + 1}
          </button>
        )}

        {/* Schedule info */}
        <span className="font-bold text-slate-700 text-xs">#{item.Schedule}</span>
        <span className="text-[11px] text-slate-500 font-medium">{item["Dominant City"]}</span>

        {/* Rotation summary chips */}
        <div className="flex-1 flex gap-0.5 overflow-hidden ml-1">
          {Array.from({ length: NUM_BLOCKS }, (_, i) => {
            const rot = (item[`Block ${i + 1} Rotation`] || "").trim();
            return (
              <span
                key={i}
                className="inline-block w-1.5 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: colorFor(rot) }}
                title={`B${i + 1}: ${rot}`}
              />
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onMoveToTop(index); }} disabled={index === 0}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-20 text-slate-400 text-[10px] font-bold" title="Move to top">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/><line x1="5" y1="3" x2="19" y2="3"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onMove(index, -1); }} disabled={index === 0}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-20 text-slate-400" title="Move up">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onMove(index, 1); }} disabled={index === total - 1}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-20 text-slate-400" title="Move down">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onMoveToBottom(index); }} disabled={index === total - 1}
            className="p-1 rounded hover:bg-slate-200 disabled:opacity-20 text-slate-400" title="Move to bottom">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/><line x1="5" y1="21" x2="19" y2="21"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onRemove(index); }}
            className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 ml-0.5" title="Remove">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      {/* Show bottom indicator only on the very last item */}
      {index === total - 1 && <DropIndicator show={isDragOverBottom} />}
    </>
  );
}

// ─── Schedule Card (expanded view for rank list) ────────────────────────────
function ScheduleCard({
  item, index, total, selected, locked, onSelect, onToggleLock, onMove, onRemove, onReorder,
  onMoveToTop, onMoveToBottom, dragHandlers, isDragOverTop, isDragOverBottom, isDragging, animatingId,
}) {
  const [editingRank, setEditingRank] = useState(false);
  const [rankInput, setRankInput] = useState("");
  const schedId = String(item.Schedule).trim();
  const isAnimating = animatingId === schedId;

  const handleRankSubmit = () => {
    const newIndex = parseInt(rankInput, 10) - 1;
    if (!isNaN(newIndex) && newIndex >= 0 && newIndex < total && newIndex !== index) {
      onReorder(index, newIndex);
    }
    setEditingRank(false);
    setRankInput("");
  };

  return (
    <>
      <DropIndicator show={isDragOverTop} />
      <div
        {...(locked ? {} : dragHandlers)}
        className={cn(
          "bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group",
          locked ? "border-amber-200" : "border-slate-200",
          isDragging ? "opacity-40 scale-[0.98]" : "",
          selected ? "ring-2 ring-blue-400" : "",
          isAnimating ? "animate-flash-highlight" : ""
        )}
      >
        <div className={cn("flex items-center justify-between px-4 py-3 border-b border-slate-100", locked ? "bg-amber-50/50" : "bg-slate-50/80")}>
          <div className="flex items-center gap-3">
            {/* Drag handle */}
            <div className={cn(locked ? "text-slate-200 cursor-not-allowed" : "cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500")} title={locked ? "Locked" : "Drag to reorder"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
            </div>

            {/* Lock button */}
            <button onClick={() => onToggleLock(index)}
              className={cn("p-1 rounded transition-colors", locked ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-slate-500")}
              title={locked ? "Unlock position" : "Lock position"}>
              {locked ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>
              )}
            </button>

            {/* Select checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(index)}
              className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
            />

            {editingRank ? (
              <input
                type="number" autoFocus min={1} max={total} value={rankInput}
                onChange={(e) => setRankInput(e.target.value)}
                onBlur={handleRankSubmit}
                onKeyDown={(e) => { if (e.key === "Enter") handleRankSubmit(); if (e.key === "Escape") { setEditingRank(false); setRankInput(""); } }}
                className="w-12 h-8 rounded-lg border-2 border-blue-400 text-center text-sm font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-blue-50"
              />
            ) : (
              <button
                onClick={() => { setEditingRank(true); setRankInput(String(index + 1)); }}
                className="relative flex items-center justify-center w-10 h-8 rounded-lg border-2 border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-colors cursor-text group/rank"
                title="Click to type a rank number"
              >
                {index + 1}
              </button>
            )}
            <div>
              <span className="font-bold text-slate-800 text-sm">
                Schedule {item.Schedule}
              </span>
              <span className="ml-2 text-xs text-slate-500 font-medium">
                {item["Dominant City"]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onMoveToTop(index)} disabled={index === 0}
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500" title="Move to top">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/><line x1="5" y1="3" x2="19" y2="3"/></svg>
            </button>
            <button onClick={() => onMove(index, -1)} disabled={index === 0}
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500" title="Move up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button onClick={() => onMove(index, 1)} disabled={index === total - 1}
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500" title="Move down">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <button onClick={() => onMoveToBottom(index)} disabled={index === total - 1}
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500" title="Move to bottom">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/><line x1="5" y1="21" x2="19" y2="21"/></svg>
            </button>
            <button onClick={() => onRemove(index)}
              className="p-1.5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-500 ml-1" title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-9 divide-x divide-slate-100">
          {Array.from({ length: NUM_BLOCKS }, (_, i) => {
            const rot = (item[`Block ${i + 1} Rotation`] || "").trim();
            const site = (item[`Block ${i + 1} Site`] || "").trim();
            return (
              <div key={i} className="px-2 py-2.5 text-center flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400 font-medium">B{i + 1}</span>
                <RotationBadge rotation={rot} size="sm" />
                <SiteLabel site={site} />
              </div>
            );
          })}
        </div>
      </div>
      {/* Show bottom indicator only on the very last item */}
      {index === total - 1 && <DropIndicator show={isDragOverBottom} />}
    </>
  );
}

// ─── Filter Grid (the rotation×block checkbox matrix) ────────────────────────
function FilterGrid({ excluded, onToggle, onToggleAll, onToggleColumn }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">
          Rotation Filter Grid
        </h3>
        <span className="text-[10px] text-slate-400">
          Uncheck to exclude a rotation from a block
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="text-left px-3 py-2 font-semibold text-slate-600 sticky left-0 bg-slate-50/50 z-10">
                Rotation
              </th>
              <th className="px-1 py-2 text-center text-slate-500 font-medium w-10">
                <button
                  onClick={() => onToggleAll("all")}
                  className="text-blue-500 hover:text-blue-700 text-[10px] underline"
                  title="Toggle all"
                >
                  All
                </button>
              </th>
              {Array.from({ length: NUM_BLOCKS }, (_, i) => {
                const block = i + 1;
                const allCheckedInCol = SPECIALTIES.every(
                  (spec) => !(excluded[block] && excluded[block].has(spec))
                );
                return (
                  <th key={i} className="px-1 py-2 text-center text-slate-500 font-medium w-10">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>B{block}</span>
                      <input
                        type="checkbox"
                        checked={allCheckedInCol}
                        onChange={() => onToggleColumn(block)}
                        className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                        title={`Toggle all Block ${block}`}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SPECIALTIES.map((spec) => {
              const allChecked = Array.from({ length: NUM_BLOCKS }, (_, i) => i + 1).every(
                (b) => !(excluded[b] && excluded[b].has(spec))
              );
              return (
                <tr key={spec} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-1.5 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: colorFor(spec) }}
                      />
                      <span className="font-medium text-slate-700 whitespace-nowrap">{spec}</span>
                    </div>
                  </td>
                  <td className="text-center px-1">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => onToggleAll(spec)}
                      className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                    />
                  </td>
                  {Array.from({ length: NUM_BLOCKS }, (_, i) => {
                    const block = i + 1;
                    const isExcluded = excluded[block] && excluded[block].has(spec);
                    return (
                      <td key={i} className="text-center px-1">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => onToggle(spec, block)}
                          className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                        />
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
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  // State
  const [allSchedules, setAllSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("search"); // "search" | "rank" | "smart"
  const [rankList, setRankList] = useState([]);
  const [toast, setToast] = useState(null);

  // Rank list UI
  const [compactMode, setCompactMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [dragOverHalf, setDragOverHalf] = useState(null); // "top" | "bottom"
  const [undoStack, setUndoStack] = useState([]);
  const [rankSearch, setRankSearch] = useState("");
  const [lockedIndices, setLockedIndices] = useState(new Set());
  const [animatingId, setAnimatingId] = useState(null);

  // Filters
  const [selectedCities, setSelectedCities] = useState(new Set());
  const [filterMode, setFilterMode] = useState("city");
  const [hideRanked, setHideRanked] = useState(true);
  const [excluded, setExcluded] = useState({}); // { blockNum: Set<rotation> }
  const [sortBy, setSortBy] = useState("id"); // "id" | "distance" | "city"
  const [searchText, setSearchText] = useState("");
  const [showFilterGrid, setShowFilterGrid] = useState(true);

  const fileInputRef = useRef(null);

  // ─── Flash animation helper ────────────────────────────────────────────────
  const flashAnimate = useCallback((scheduleId) => {
    setAnimatingId(scheduleId);
    setTimeout(() => setAnimatingId(null), 500);
  }, []);

  // ─── Load CSV ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}schedules.csv`);
        const text = await resp.text();
        const parsed = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
        });
        setAllSchedules(parsed.data);
      } catch (err) {
        console.error("Failed to load schedules:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  // ─── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ─── Filter Logic ──────────────────────────────────────────────────────────
  const rankedIds = useMemo(
    () => new Set(rankList.map((r) => String(r.Schedule).trim())),
    [rankList]
  );

  const rotationFilterActive = useMemo(
    () => Object.values(excluded).some((s) => s.size > 0),
    [excluded]
  );

  const filtered = useMemo(() => {
    let result = allSchedules;

    // Hide ranked
    if (hideRanked) {
      result = result.filter((r) => !rankedIds.has(String(r.Schedule).trim()));
    }

    // Text search (schedule ID or site name)
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      result = result.filter((r) => {
        if (String(r.Schedule).includes(q)) return true;
        for (let i = 1; i <= NUM_BLOCKS; i++) {
          if ((r[`Block ${i} Site`] || "").toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    // City filter
    const cityMatch = (r) =>
      selectedCities.size === 0 || selectedCities.has((r["Dominant City"] || "").trim());

    // Rotation filter
    const rotationMatch = (r) => {
      if (!rotationFilterActive) return true;
      for (let i = 1; i <= NUM_BLOCKS; i++) {
        const rot = (r[`Block ${i} Rotation`] || "").trim();
        if (excluded[i] && excluded[i].has(rot)) return false;
      }
      return true;
    };

    switch (filterMode) {
      case "city":
        result = result.filter(cityMatch);
        break;
      case "rotation":
        result = result.filter(rotationMatch);
        break;
      case "and":
        result = result.filter((r) => cityMatch(r) && rotationMatch(r));
        break;
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === "distance")
        return (
          parseFloat(a["Max Pairwise Distance (min)"] || 999) -
          parseFloat(b["Max Pairwise Distance (min)"] || 999)
        );
      if (sortBy === "city")
        return (a["Dominant City"] || "").localeCompare(b["Dominant City"] || "");
      return parseInt(a.Schedule) - parseInt(b.Schedule);
    });

    return result;
  }, [
    allSchedules,
    selectedCities,
    filterMode,
    hideRanked,
    excluded,
    rankedIds,
    rotationFilterActive,
    sortBy,
    searchText,
  ]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const toggleCity = (city) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  };

  const toggleExcluded = (rotation, block) => {
    setExcluded((prev) => {
      const next = { ...prev };
      if (!next[block]) next[block] = new Set();
      else next[block] = new Set(next[block]);
      if (next[block].has(rotation)) next[block].delete(rotation);
      else next[block].add(rotation);
      return next;
    });
  };

  const toggleAllForRotation = (rotation) => {
    setExcluded((prev) => {
      const next = { ...prev };
      if (rotation === "all") {
        const anyExcluded = Object.values(next).some((s) => s.size > 0);
        if (anyExcluded) {
          return {};
        } else {
          const fresh = {};
          for (let i = 1; i <= NUM_BLOCKS; i++) {
            fresh[i] = new Set(SPECIALTIES);
          }
          return fresh;
        }
      }
      const allExcluded = Array.from({ length: NUM_BLOCKS }, (_, i) => i + 1).every(
        (b) => next[b] && next[b].has(rotation)
      );
      for (let i = 1; i <= NUM_BLOCKS; i++) {
        if (!next[i]) next[i] = new Set();
        else next[i] = new Set(next[i]);
        if (allExcluded) next[i].delete(rotation);
        else next[i].add(rotation);
      }
      return next;
    });
  };

  const toggleColumn = (block) => {
    setExcluded((prev) => {
      const next = { ...prev };
      const allChecked = SPECIALTIES.every(
        (spec) => !(next[block] && next[block].has(spec))
      );
      if (allChecked) {
        next[block] = new Set(SPECIALTIES);
      } else {
        next[block] = new Set();
      }
      return next;
    });
  };

  const addToRank = (schedule) => {
    const id = String(schedule.Schedule).trim();
    if (rankedIds.has(id)) {
      showToast("Already in your rank list!", "warn");
      return;
    }
    setRankList((prev) => [...prev, schedule]);
    showToast(`Schedule ${id} added (#${rankList.length + 1})`);
  };

  const removeFromRank = (index) => {
    if (lockedIndices.has(index)) { showToast("Unlock first to remove", "warn"); return; }
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    setRankList((prev) => prev.filter((_, i) => i !== index));
    setLockedIndices((prev) => {
      const next = new Set();
      for (const li of prev) {
        if (li < index) next.add(li);
        else if (li > index) next.add(li - 1);
      }
      return next;
    });
    setSelectedIndices((prev) => {
      const next = new Set();
      for (const si of prev) {
        if (si < index) next.add(si);
        else if (si > index) next.add(si - 1);
      }
      return next;
    });
  };

  const moveRank = (index, dir) => {
    if (lockedIndices.has(index)) { showToast("Unlock first to move", "warn"); return; }
    let newIndex = index + dir;
    while (newIndex >= 0 && newIndex < rankList.length && lockedIndices.has(newIndex)) {
      newIndex += dir;
    }
    if (newIndex < 0 || newIndex >= rankList.length) return;
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    setRankList((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(newIndex, 0, item);
      return next;
    });
    // Flash the moved item
    flashAnimate(String(rankList[index].Schedule).trim());
    setLockedIndices((prev) => {
      const next = new Set();
      for (const li of prev) {
        if (li === index) { next.add(newIndex); continue; }
        let adjusted = li;
        if (index < newIndex) {
          if (li > index && li <= newIndex) adjusted = li - 1;
        } else {
          if (li >= newIndex && li < index) adjusted = li + 1;
        }
        next.add(adjusted);
      }
      return next;
    });
  };

  const reorderRank = (fromIndex, toIndex) => {
    if (lockedIndices.has(fromIndex)) { showToast("Unlock first to move", "warn"); return; }
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    setRankList((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    flashAnimate(String(rankList[fromIndex].Schedule).trim());
    setLockedIndices((prev) => {
      const next = new Set();
      for (const li of prev) {
        if (li === fromIndex) { next.add(toIndex); continue; }
        let adjusted = li;
        if (fromIndex < toIndex) {
          if (li > fromIndex && li <= toIndex) adjusted = li - 1;
        } else {
          if (li >= toIndex && li < fromIndex) adjusted = li + 1;
        }
        next.add(adjusted);
      }
      return next;
    });
  };

  const moveToTop = (index) => {
    if (index === 0) return;
    if (lockedIndices.has(index)) { showToast("Unlock first to move", "warn"); return; }
    let target = 0;
    while (target < index && lockedIndices.has(target)) target++;
    if (target >= index) return;
    reorderRank(index, target);
    showToast(`Moved to #${target + 1}`);
  };

  const moveToBottom = (index) => {
    if (index === rankList.length - 1) return;
    if (lockedIndices.has(index)) { showToast("Unlock first to move", "warn"); return; }
    let target = rankList.length - 1;
    while (target > index && lockedIndices.has(target)) target--;
    if (target <= index) return;
    reorderRank(index, target);
    showToast(`Moved to #${target + 1}`);
  };

  // Lock toggle
  const toggleLock = (index) => {
    setLockedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const undoRankAction = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRankList(prev);
    showToast("Undone");
  };

  // Selection
  const toggleSelect = (index) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIndices.size === rankList.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(rankList.map((_, i) => i)));
    }
  };

  // Helper: check if any selected items are locked
  const hasLockedSelected = useMemo(() => {
    return [...selectedIndices].some((i) => lockedIndices.has(i));
  }, [selectedIndices, lockedIndices]);

  // Helper: get only unlocked selected indices
  const unlockedSelected = useMemo(() => {
    return [...selectedIndices].filter((i) => !lockedIndices.has(i)).sort((a, b) => a - b);
  }, [selectedIndices, lockedIndices]);

  const bulkMoveToTop = () => {
    if (unlockedSelected.length === 0) {
      if (hasLockedSelected) showToast("All selected items are locked", "warn");
      return;
    }
    if (hasLockedSelected) showToast("Skipping locked items", "warn");
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    const sorted = unlockedSelected;
    setRankList((prev) => {
      const selected = sorted.map((i) => prev[i]);
      const indicesToRemove = new Set(sorted);
      const rest = prev.filter((_, i) => !indicesToRemove.has(i));
      return [...selected, ...rest];
    });
    setSelectedIndices(new Set());
    showToast(`Moved ${sorted.length} to top`);
  };

  const bulkMoveToBottom = () => {
    if (unlockedSelected.length === 0) {
      if (hasLockedSelected) showToast("All selected items are locked", "warn");
      return;
    }
    if (hasLockedSelected) showToast("Skipping locked items", "warn");
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    const sorted = unlockedSelected;
    setRankList((prev) => {
      const selected = sorted.map((i) => prev[i]);
      const indicesToRemove = new Set(sorted);
      const rest = prev.filter((_, i) => !indicesToRemove.has(i));
      return [...rest, ...selected];
    });
    setSelectedIndices(new Set());
    showToast(`Moved ${sorted.length} to bottom`);
  };

  // Bulk move up/down by 1 position (keeping relative order)
  const bulkMoveUp = () => {
    if (unlockedSelected.length === 0) {
      if (hasLockedSelected) showToast("All selected items are locked", "warn");
      return;
    }
    const sorted = unlockedSelected;
    // Check if the topmost unlocked selected item can move up
    const minIdx = sorted[0];
    // Find the nearest position above that isn't locked and isn't in the selection
    let target = minIdx - 1;
    while (target >= 0 && (lockedIndices.has(target) || selectedIndices.has(target))) target--;
    if (target < 0) return; // can't move up further

    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    setRankList((prev) => {
      const next = [...prev];
      // Move each selected unlocked item up by swapping with the item above (that isn't selected/locked)
      // Strategy: extract unlocked selected, remove them, insert them one position earlier
      const items = sorted.map((i) => prev[i]);
      const indicesToRemove = new Set(sorted);
      const rest = prev.filter((_, i) => !indicesToRemove.has(i));
      // Find where the first item was in the rest array
      let insertAt = 0;
      for (let i = 0; i < rest.length; i++) {
        // Find the position just before where the first selected item's predecessor is
        if (i === target - sorted.filter(s => s < target).length) {
          insertAt = i;
          break;
        }
        insertAt = i + 1;
      }
      // Simpler approach: just move the block up by 1 in terms of the non-selected items
      // The topmost item moves above the item that was directly above it
      const restIndex = minIdx - sorted.filter(s => s < minIdx).length - 1;
      const safeInsert = Math.max(0, restIndex);
      rest.splice(safeInsert, 0, ...items);
      return rest;
    });
    // Adjust selection indices
    setSelectedIndices((prev) => {
      const next = new Set();
      for (const i of prev) {
        if (lockedIndices.has(i)) {
          next.add(i); // locked items stay
        } else {
          next.add(Math.max(0, i - 1));
        }
      }
      return next;
    });
  };

  const bulkMoveDown = () => {
    if (unlockedSelected.length === 0) {
      if (hasLockedSelected) showToast("All selected items are locked", "warn");
      return;
    }
    const sorted = unlockedSelected;
    const maxIdx = sorted[sorted.length - 1];
    // Check if the bottommost unlocked selected item can move down
    let target = maxIdx + 1;
    while (target < rankList.length && (lockedIndices.has(target) || selectedIndices.has(target))) target++;
    if (target >= rankList.length) return; // can't move down further

    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    setRankList((prev) => {
      const items = sorted.map((i) => prev[i]);
      const indicesToRemove = new Set(sorted);
      const rest = prev.filter((_, i) => !indicesToRemove.has(i));
      // Find insert position: after the item that was directly below the last selected item
      const restIndex = maxIdx - sorted.filter(s => s < maxIdx).length;
      // We want to insert after restIndex, so restIndex + 1
      const safeInsert = Math.min(rest.length, restIndex + 1);
      rest.splice(safeInsert, 0, ...items);
      return rest;
    });
    // Adjust selection indices
    setSelectedIndices((prev) => {
      const next = new Set();
      for (const i of prev) {
        if (lockedIndices.has(i)) {
          next.add(i);
        } else {
          next.add(Math.min(rankList.length - 1, i + 1));
        }
      }
      return next;
    });
  };

  const bulkMoveToPosition = (pos) => {
    if (unlockedSelected.length === 0 || isNaN(pos)) {
      if (hasLockedSelected) showToast("All selected items are locked", "warn");
      return;
    }
    if (hasLockedSelected) showToast("Skipping locked items", "warn");
    const targetIdx = Math.max(0, Math.min(rankList.length - 1, pos - 1));
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    const sorted = unlockedSelected;
    setRankList((prev) => {
      const selected = sorted.map((i) => prev[i]);
      const indicesToRemove = new Set(sorted);
      const rest = prev.filter((_, i) => !indicesToRemove.has(i));
      const safeTarget = Math.min(targetIdx, rest.length);
      rest.splice(safeTarget, 0, ...selected);
      return rest;
    });
    setSelectedIndices(new Set());
    showToast(`Moved ${sorted.length} to #${targetIdx + 1}`);
  };

  const bulkRemove = () => {
    if (selectedIndices.size === 0) return;
    // Check for locked items
    const lockedSelected = [...selectedIndices].filter((i) => lockedIndices.has(i));
    if (lockedSelected.length === selectedIndices.size) {
      showToast("All selected items are locked", "warn");
      return;
    }
    if (lockedSelected.length > 0) {
      showToast(`Skipping ${lockedSelected.length} locked item(s)`, "warn");
    }
    const toRemove = new Set(unlockedSelected);
    setUndoStack((prev) => [...prev.slice(-19), rankList]);
    setRankList((prev) => prev.filter((_, i) => !toRemove.has(i)));
    showToast(`Removed ${toRemove.size} schedules`);
    setSelectedIndices(new Set());
  };

  // Drag and drop — improved with "between items" indicator
  const handleDragStart = (index) => (e) => {
    if (lockedIndices.has(index)) { e.preventDefault(); return; }
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    if (selectedIndices.has(index) && selectedIndices.size > 1) {
      const indices = [...selectedIndices].filter((i) => !lockedIndices.has(i)).sort((a, b) => a - b);
      e.dataTransfer.setData("text/plain", indices.join(","));
    } else {
      e.dataTransfer.setData("text/plain", String(index));
    }
  };

  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Determine if we're in the top or bottom half of the element
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const half = y < rect.height / 2 ? "top" : "bottom";
    if (dragOverIndex !== index || dragOverHalf !== half) {
      setDragOverIndex(index);
      setDragOverHalf(half);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    setDragOverHalf(null);
  };

  const handleDrop = (toIndex) => (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const indices = raw.split(",").map(Number).filter((n) => !isNaN(n));

    // Calculate actual insert index based on which half we dropped on
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const dropAfter = y >= rect.height / 2;
    let insertIndex = dropAfter ? toIndex + 1 : toIndex;

    if (indices.length > 1) {
      const anyLocked = indices.some((i) => lockedIndices.has(i));
      if (anyLocked) { showToast("Unlock selected items first", "warn"); setDragIndex(null); setDragOverIndex(null); setDragOverHalf(null); return; }
      setUndoStack((prev) => [...prev.slice(-19), rankList]);
      setRankList((prev) => {
        const items = indices.map((i) => prev[i]);
        const indicesSet = new Set(indices);
        const rest = prev.filter((_, i) => !indicesSet.has(i));
        // Adjust insert position for removed items before it
        let removedBefore = 0;
        for (const idx of indices) { if (idx < insertIndex) removedBefore++; }
        let safeInsert = Math.min(insertIndex - removedBefore, rest.length);
        safeInsert = Math.max(0, safeInsert);
        rest.splice(safeInsert, 0, ...items);
        return rest;
      });
      setSelectedIndices(new Set());
      setLockedIndices((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set();
        for (const li of prev) { if (!selectedIndices.has(li)) next.add(li); }
        return next;
      });
    } else if (indices.length === 1) {
      const fromIndex = indices[0];
      // Adjust insert index if from is before to
      let adjustedTo = insertIndex;
      if (fromIndex < insertIndex) adjustedTo -= 1;
      if (fromIndex !== adjustedTo && adjustedTo >= 0 && adjustedTo < rankList.length) {
        reorderRank(fromIndex, adjustedTo);
      }
    }
    setDragIndex(null);
    setDragOverIndex(null);
    setDragOverHalf(null);
  };

  // Filtered rank list for search
  const filteredRankList = useMemo(() => {
    if (!rankSearch.trim()) return rankList.map((item, i) => ({ item, originalIndex: i }));
    const q = rankSearch.toLowerCase().trim();
    return rankList
      .map((item, i) => ({ item, originalIndex: i }))
      .filter(({ item }) => {
        if (String(item.Schedule).includes(q)) return true;
        if ((item["Dominant City"] || "").toLowerCase().includes(q)) return true;
        for (let i = 1; i <= NUM_BLOCKS; i++) {
          if ((item[`Block ${i} Site`] || "").toLowerCase().includes(q)) return true;
        }
        return false;
      });
  }, [rankList, rankSearch]);

  const downloadExcel = () => {
    if (rankList.length === 0) {
      showToast("Nothing to download", "warn");
      return;
    }
    const data = [["Rank", "Schedule ID"]];
    rankList.forEach((item, i) => data.push([i + 1, item.Schedule]));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Rank List");
    XLSX.writeFile(wb, "my_rank_list.xlsx");
    showToast("Excel downloaded!");
  };

  const uploadExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false });
        const headers = Object.keys(rows[0]);
        const idCol =
          headers.find((h) => h.toLowerCase().includes("schedule")) ||
          headers[1] ||
          headers[0];

        const idMap = new Map();
        allSchedules.forEach((s) => idMap.set(String(s.Schedule).trim(), s));

        const newList = [];
        let notFound = 0;
        const seen = new Set();
        rows.forEach((r) => {
          const id = String(r[idCol] || "").trim();
          if (!id) return;
          if (idMap.has(id) && !seen.has(id)) {
            newList.push(idMap.get(id));
            seen.add(id);
          } else if (!idMap.has(id)) notFound++;
        });
        setRankList(newList);
        showToast(
          `Uploaded ${newList.length} schedules${notFound ? ` (${notFound} not found)` : ""}`
        );
      } catch (err) {
        showToast("Error reading file", "error");
        console.error(err);
      }
      e.target.value = null;
    };
    reader.readAsArrayBuffer(file);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 text-sm font-medium">Loading schedules…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Inline style for flash animation */}
      <style>{`
        @keyframes flash-highlight {
          0% { background-color: rgba(59, 130, 246, 0.15); }
          100% { background-color: transparent; }
        }
        .animate-flash-highlight {
          animation: flash-highlight 0.5s ease-out;
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all",
            toast.type === "error"
              ? "bg-red-500 text-white"
              : toast.type === "warn"
              ? "bg-amber-500 text-white"
              : "bg-emerald-500 text-white"
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-800 leading-tight tracking-tight">
                NEOMED Lottery Tool by saad :)
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">
                {allSchedules.length} schedules · {CITIES.length} cities
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("search")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                view === "search"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              Search
            </button>
            <button
              onClick={() => setView("smart")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5",
                view === "smart"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              Smart Rank
            </button>
            <button
              onClick={() => setView("rank")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
                view === "rank"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              Rank List
              {rankList.length > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-[11px] font-bold px-1.5",
                    view === "rank"
                      ? "bg-white/20 text-white"
                      : "bg-blue-100 text-blue-600"
                  )}
                >
                  {rankList.length}
                </span>
              )}
            </button>
            <a
              href="https://www.google.com/maps/d/viewer?mid=1f8UN2kqrRxwkvB3JdoBt6D4huC1UOUk&usp=sharing"
              target="_blank"
              rel="noopener"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 flex items-center gap-1.5 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Map
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 py-6">
        {/* ═══ SEARCH VIEW ═══ */}
        {view === "search" && (
          <div className="space-y-4">
            {/* Top filter bar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
              {/* City chips */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                  Cities
                </label>
                <div className="flex flex-wrap gap-2">
                  {CITIES.map((c) => (
                    <ToggleChip
                      key={c}
                      label={c}
                      active={selectedCities.has(c)}
                      onClick={() => toggleCity(c)}
                      color="#3B82F6"
                    />
                  ))}
                  {selectedCities.size > 0 && (
                    <button
                      onClick={() => setSelectedCities(new Set())}
                      className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Controls row */}
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100">
                {/* Filter mode */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500">Mode:</label>
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="city">City Only</option>
                    <option value="rotation">Rotation Only</option>
                    <option value="and">City AND Rotation</option>
                  </select>
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500">Sort:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="id">Schedule #</option>
                    <option value="city">City</option>
                  </select>
                </div>

                {/* Text search */}
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search by schedule # or site name…"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                {/* Hide ranked */}
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideRanked}
                    onChange={(e) => setHideRanked(e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-500"
                  />
                  <span className="text-xs text-slate-600 font-medium">Hide ranked</span>
                </label>

                {/* Toggle filter grid */}
                <button
                  onClick={() => setShowFilterGrid((p) => !p)}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all",
                    showFilterGrid
                      ? "bg-blue-50 text-blue-600 border-blue-200"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {showFilterGrid ? "Hide" : "Show"} Rotation Grid
                </button>
              </div>
            </div>

            {/* Filter Grid (collapsible) */}
            {showFilterGrid && (
              <FilterGrid
                excluded={excluded}
                onToggle={toggleExcluded}
                onToggleAll={toggleAllForRotation}
                onToggleColumn={toggleColumn}
              />
            )}

            {/* Results count */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">
                Showing{" "}
                <span className="font-bold text-slate-700">{filtered.length}</span> of{" "}
                {allSchedules.length} schedules
              </p>
            </div>

            {/* Results table */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <p className="text-lg font-semibold">No matches found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs table-fixed">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-1 py-2.5 text-center font-semibold text-slate-500" style={{width: '40px'}}>
                          Add
                        </th>
                        <th className="px-1 py-2.5 text-center font-semibold text-slate-500" style={{width: '36px'}}>
                          #
                        </th>
                        <th className="px-1 py-2.5 text-center font-semibold text-slate-500" style={{width: '70px'}}>
                          City
                        </th>
                        {Array.from({ length: NUM_BLOCKS }, (_, i) => (
                          <th key={i} className="px-0.5 py-2.5 text-center font-semibold text-slate-500">
                            <div className="text-[10px]">Block {i + 1}</div>
                            <div className="text-[8px] font-normal text-slate-400">
                              {BLOCK_DATES[i + 1]}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((r) => {
                        const id = String(r.Schedule).trim();
                        const isRanked = rankedIds.has(id);
                        return (
                          <tr
                            key={id}
                            className={cn(
                              "hover:bg-blue-50/30 transition-colors",
                              isRanked && "opacity-50"
                            )}
                          >
                            <td className="px-1 py-2 text-center">
                              <button
                                onClick={() => addToRank(r)}
                                disabled={isRanked}
                                className={cn(
                                  "w-6 h-6 rounded-md text-xs font-bold transition-all",
                                  isRanked
                                    ? "bg-emerald-100 text-emerald-500 cursor-not-allowed"
                                    : "bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white hover:shadow-sm"
                                )}
                              >
                                {isRanked ? "✓" : "+"}
                              </button>
                            </td>
                            <td className="px-1 py-2 text-center font-bold text-slate-700 text-[11px]">
                              {id}
                            </td>
                            <td className="px-1 py-2 text-center text-slate-600 font-medium text-[10px]">
                              {r["Dominant City"]}
                            </td>
                            {Array.from({ length: NUM_BLOCKS }, (_, i) => {
                              const rot = (r[`Block ${i + 1} Rotation`] || "").trim();
                              const site = (r[`Block ${i + 1} Site`] || "").trim();
                              return (
                                <td key={i} className="px-0.5 py-1.5 text-center">
                                  <BlockCell rotation={rot} site={site} />
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
            )}
          </div>
        )}

        {/* ═══ RANK LIST VIEW ═══ */}
        {view === "rank" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-slate-800">
                My Rank List
                <span className="ml-2 text-sm font-medium text-slate-400">
                  {rankList.length} schedule{rankList.length !== 1 && "s"}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={uploadExcel} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                  Upload Excel
                </button>
                <button onClick={downloadExcel}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all">
                  Download Excel
                </button>
                {undoStack.length > 0 && (
                  <button onClick={undoRankAction}
                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-11.36L1 10"/></svg>
                    Undo
                  </button>
                )}
                {rankList.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm("Clear your entire rank list?")) {
                        setUndoStack((prev) => [...prev.slice(-19), rankList]);
                        setRankList([]);
                        setSelectedIndices(new Set());
                        setLockedIndices(new Set());
                        showToast("Rank list cleared");
                      }
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-all">
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Secondary toolbar: view toggle, search, selection actions */}
            {rankList.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* View toggle */}
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                    <button onClick={() => setCompactMode(false)}
                      className={cn("px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                        !compactMode ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600")}>
                      Expanded
                    </button>
                    <button onClick={() => setCompactMode(true)}
                      className={cn("px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                        compactMode ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600")}>
                      Compact
                    </button>
                  </div>

                  {/* Search */}
                  <div className="flex-1 min-w-[180px]">
                    <input
                      type="text"
                      placeholder="Search rank list by schedule #, city, or site..."
                      value={rankSearch}
                      onChange={(e) => setRankSearch(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  {/* Select all */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedIndices.size === rankList.length && rankList.length > 0}
                      onChange={selectAll}
                      className="w-3.5 h-3.5 accent-blue-500"
                    />
                    <span className="text-xs text-slate-600 font-medium">Select all</span>
                  </label>

                  {lockedIndices.size > 0 && (
                    <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      {lockedIndices.size} locked
                    </span>
                  )}
                </div>

                {/* Bulk actions bar */}
                {selectedIndices.size > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs font-semibold text-blue-600">
                      {selectedIndices.size} selected
                      {hasLockedSelected && (
                        <span className="text-amber-500 ml-1">
                          ({[...selectedIndices].filter((i) => lockedIndices.has(i)).length} locked)
                        </span>
                      )}
                    </span>
                    <button onClick={bulkMoveToTop}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Move selected to top">
                      ⇈ Top
                    </button>
                    <button onClick={bulkMoveUp}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Move selected up one position">
                      ↑ Up
                    </button>
                    <button onClick={bulkMoveDown}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Move selected down one position">
                      ↓ Down
                    </button>
                    <button onClick={bulkMoveToBottom}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Move selected to bottom">
                      ⇊ Bottom
                    </button>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-500">Move to #</span>
                      <input
                        type="number" min={1} max={rankList.length} placeholder="#"
                        className="w-14 text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            bulkMoveToPosition(parseInt(e.target.value, 10));
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                    <button onClick={bulkRemove}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-red-200 text-red-500 hover:bg-red-50 ml-auto">
                      Remove selected
                    </button>
                    <button onClick={() => {
                      setLockedIndices((prev) => {
                        const next = new Set(prev);
                        const allLocked = [...selectedIndices].every((i) => next.has(i));
                        for (const i of selectedIndices) {
                          if (allLocked) next.delete(i); else next.add(i);
                        }
                        return next;
                      });
                    }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-amber-200 text-amber-600 hover:bg-amber-50">
                      {[...selectedIndices].every((i) => lockedIndices.has(i)) ? "Unlock" : "Lock"} selected
                    </button>
                    <button onClick={() => setSelectedIndices(new Set())}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-600">
                      Deselect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* List */}
            {rankList.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <svg className="mx-auto mb-3 w-12 h-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                <p className="text-lg font-semibold">No schedules ranked yet</p>
                <p className="text-sm mt-1">
                  Switch to Search to add schedules, or upload an Excel file
                </p>
              </div>
            ) : filteredRankList.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm font-semibold">No matches in rank list</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            ) : compactMode ? (
              <div className="space-y-1">
                {filteredRankList.map(({ item, originalIndex }) => (
                  <CompactRow
                    key={`${item.Schedule}-${originalIndex}`}
                    item={item}
                    index={originalIndex}
                    total={rankList.length}
                    selected={selectedIndices.has(originalIndex)}
                    locked={lockedIndices.has(originalIndex)}
                    onSelect={toggleSelect}
                    onToggleLock={toggleLock}
                    onMove={moveRank}
                    onRemove={removeFromRank}
                    onReorder={reorderRank}
                    onMoveToTop={moveToTop}
                    onMoveToBottom={moveToBottom}
                    animatingId={animatingId}
                    dragHandlers={{
                      draggable: true,
                      onDragStart: handleDragStart(originalIndex),
                      onDragOver: handleDragOver(originalIndex),
                      onDragEnd: handleDragEnd,
                      onDrop: handleDrop(originalIndex),
                    }}
                    isDragOverTop={dragOverIndex === originalIndex && dragOverHalf === "top"}
                    isDragOverBottom={dragOverIndex === originalIndex && dragOverHalf === "bottom"}
                    isDragging={dragIndex === originalIndex}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRankList.map(({ item, originalIndex }) => (
                  <ScheduleCard
                    key={`${item.Schedule}-${originalIndex}`}
                    item={item}
                    index={originalIndex}
                    total={rankList.length}
                    selected={selectedIndices.has(originalIndex)}
                    locked={lockedIndices.has(originalIndex)}
                    onSelect={toggleSelect}
                    onToggleLock={toggleLock}
                    onMove={moveRank}
                    onRemove={removeFromRank}
                    onReorder={reorderRank}
                    onMoveToTop={moveToTop}
                    onMoveToBottom={moveToBottom}
                    animatingId={animatingId}
                    dragHandlers={{
                      draggable: true,
                      onDragStart: handleDragStart(originalIndex),
                      onDragOver: handleDragOver(originalIndex),
                      onDragEnd: handleDragEnd,
                      onDrop: handleDrop(originalIndex),
                    }}
                    isDragOverTop={dragOverIndex === originalIndex && dragOverHalf === "top"}
                    isDragOverBottom={dragOverIndex === originalIndex && dragOverHalf === "bottom"}
                    isDragging={dragIndex === originalIndex}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ SMART RANKER VIEW ═══ */}
        {view === "smart" && (
          <SmartRanker
            schedules={allSchedules}
            onApplyRankList={(newList) => {
              setRankList(newList);
              setView("rank");
              showToast(`${newList.length} schedules added to your rank list!`);
            }}
            onBack={() => setView("search")}
          />
        )}
      </main>
    </div>
  );
}