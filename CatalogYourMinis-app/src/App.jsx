import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "miniature-catalog-app-v2";
const DEFAULT_STATUS = "Unpainted";
const STATUS_OPTIONS = ["Unbuilt", "Assembled", "Primed", "Painted", "Finished"];
const ALL_TAGS = "__all__";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function text(v) {
  return typeof v === "string" ? v.trim() : "";
}

function status(v) {
  return STATUS_OPTIONS.includes(v) ? v : DEFAULT_STATUS;
}

function emptyForm(gameId = "") {
  return {
    gameId,
    name: "",
    faction: "",
    unitType: "",
    material: "",
    status: DEFAULT_STATUS,
    notes: "",
    image: "",
  };
}

function tagsFor(mini) {
  return [text(mini?.faction), text(mini?.unitType), status(mini?.status)].filter(Boolean);
}

function sanitize(raw) {
  const games = Array.isArray(raw?.games)
    ? raw.games
        .map((g) => ({ id: text(g?.id) || uid(), name: text(g?.name) }))
        .filter((g) => g.name)
    : [];

  const seenGames = new Set();
  const cleanGames = games.filter((g) => {
    if (seenGames.has(g.id)) return false;
    seenGames.add(g.id);
    return true;
  });

  const validGameIds = new Set(cleanGames.map((g) => g.id));
  const minis = Array.isArray(raw?.miniatures)
    ? raw.miniatures
        .map((m) => ({
          id: text(m?.id) || uid(),
          gameId: text(m?.gameId),
          name: text(m?.name),
          faction: text(m?.faction),
          unitType: text(m?.unitType),
          material: text(m?.material),
          status: status(m?.status),
          notes: text(m?.notes),
          image: typeof m?.image === "string" ? m.image : "",
        }))
        .filter((m) => m.name && validGameIds.has(m.gameId))
    : [];

  const seenMinis = new Set();
  const cleanMinis = minis.filter((m) => {
    if (seenMinis.has(m.id)) return false;
    seenMinis.add(m.id);
    return true;
  });

  return { games: cleanGames, miniatures: cleanMinis };
}

function loadData() {
  if (typeof window === "undefined") return { games: [], miniatures: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : { games: [], miniatures: [] };
  } catch {
    return { games: [], miniatures: [] };
  }
}

function saveData(data) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

function compressImage(file, maxWidth = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Image processing is unavailable."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Failed to load image."));
      img.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function csvCell(value) {
  const safe = String(value ?? "").replace(/"/g, '""');
  return `"${safe}"`;
}

function buildCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function downloadCsv(filename, rows) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return csv;
}

function runTests() {
  const results = [];

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }

  test("status falls back to default", () => {
    assert(status("BadValue") === DEFAULT_STATUS, "invalid status should normalize");
    assert(status("Painted") === "Painted", "valid status should remain");
  });

  test("sanitize removes miniatures with missing games", () => {
    const data = sanitize({
      games: [{ id: "g1", name: "Game" }],
      miniatures: [{ id: "m1", gameId: "g2", name: "Mini" }],
    });
    assert(data.games.length === 1, "game should remain");
    assert(data.miniatures.length === 0, "invalid miniature should be removed");
  });

  test("csvCell escapes quotes", () => {
    assert(csvCell('a"b') === '"a""b"', "quotes should be escaped for csv");
  });

  test("buildCsv joins rows with newlines", () => {
    assert(buildCsv([["a", "b"], ["c", "d"]]) === '"a","b"\n"c","d"', "csv rows should be newline-separated");
  });

  test("emptyForm defaults image to empty string", () => {
    assert(emptyForm("g1").image === "", "new forms should start without an image");
  });

  return results;
}

const TEST_RESULTS = runTests();

const ui = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0a0c09 0%, #080907 100%)",
    color: "#d3dcc7",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  wrap: { maxWidth: 1280, margin: "0 auto", padding: 16 },
  panel: {
    background: "linear-gradient(180deg, rgba(16,18,14,0.98) 0%, rgba(11,12,10,0.98) 100%)",
    border: "1px solid rgba(167,188,126,0.18)",
    borderRadius: 4,
    padding: 14,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 4,
    border: "1px solid rgba(167,188,126,0.18)",
    background: "#0a0d09",
    color: "#e7f0d9",
    minHeight: 42,
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 4,
    border: "1px solid rgba(167,188,126,0.4)",
    background: "#293021",
    color: "#eff7df",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 42,
  },
  btnAlt: {
    padding: "10px 14px",
    borderRadius: 4,
    border: "1px solid rgba(255,176,0,0.28)",
    background: "rgba(255,176,0,0.06)",
    color: "#ffd27a",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
    cursor: "pointer",
    minHeight: 42,
  },
  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 2,
    border: "1px solid rgba(167,188,126,0.18)",
    background: "rgba(157,180,117,0.08)",
    color: "#b6c89a",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function onResize() {
      setIsMobile(window.innerWidth < 900);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
}

function Modal({ open, title, children, onClose, isMobile }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 16,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ui.panel,
          width: "100%",
          maxWidth: isMobile ? "100%" : 760,
          height: isMobile ? "100dvh" : "auto",
          maxHeight: isMobile ? "100dvh" : "90vh",
          minHeight: isMobile ? "100dvh" : "auto",
          overflow: "hidden",
          borderRadius: isMobile ? 0 : 4,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: isMobile ? 16 : 14, borderBottom: "1px solid rgba(167,188,126,0.12)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 800, color: "#eff7df", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: isMobile ? 16 : 18 }}>
              {title}
            </div>
            <button type="button" onClick={onClose} style={ui.btnAlt}>Close</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 16 : 14, paddingBottom: isMobile ? 24 : 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniatureCatalogApp() {
  const [data, setData] = useState({ games: [], miniatures: [] });
  const [selectedGameId, setSelectedGameId] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(ALL_TAGS);
  const [gameName, setGameName] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [detailId, setDetailId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [gameModal, setGameModal] = useState(false);
  const [miniModal, setMiniModal] = useState(false);
  const [error, setError] = useState("");
  const [exportModal, setExportModal] = useState(false);
  const [exportText, setExportText] = useState("");
  const [isSavingImage, setIsSavingImage] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const loaded = loadData();
    setData(loaded);
    setSelectedGameId(loaded.games[0]?.id || "");
  }, []);

  useEffect(() => {
    try {
      saveData(data);
    } catch {
      setError("Save failed. The image may be too large for browser storage. Try a smaller image.");
    }
  }, [data]);

  useEffect(() => {
    if (data.games.length === 0) {
      setSelectedGameId("");
      return;
    }
    if (!data.games.some((g) => g.id === selectedGameId)) {
      setSelectedGameId(data.games[0].id);
    }
  }, [data.games, selectedGameId]);

  useEffect(() => {
    setTagFilter(ALL_TAGS);
  }, [selectedGameId]);

  const selectedGame = data.games.find((g) => g.id === selectedGameId) || null;
  const detailMini = data.miniatures.find((m) => m.id === detailId) || null;
  const detailGame = data.games.find((g) => g.id === detailMini?.gameId) || null;
  const failedTests = TEST_RESULTS.filter((t) => !t.ok);

  const availableTags = useMemo(() => {
    const set = new Set();
    data.miniatures.forEach((m) => {
      if (selectedGameId && m.gameId !== selectedGameId) return;
      tagsFor(m).forEach((t) => set.add(t));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.miniatures, selectedGameId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.miniatures
      .filter((m) => (selectedGameId ? m.gameId === selectedGameId : true))
      .filter((m) => (tagFilter === ALL_TAGS ? true : tagsFor(m).some((t) => t.toLowerCase() === tagFilter.toLowerCase())))
      .filter((m) => {
        if (!q) return true;
        return [m.name, m.faction, m.unitType, m.material, m.status, m.notes].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.miniatures, selectedGameId, tagFilter, search]);

  const counts = useMemo(() => {
    const out = {};
    data.games.forEach((g) => {
      out[g.id] = 0;
    });
    data.miniatures.forEach((m) => {
      out[m.gameId] = (out[m.gameId] || 0) + 1;
    });
    return out;
  }, [data.games, data.miniatures]);

  function openNewMini() {
    setEditingId("");
    setForm(emptyForm(selectedGameId || data.games[0]?.id || ""));
    setMiniModal(true);
    setDetailId("");
    setError("");
  }

  function openEditMini(mini) {
    setEditingId(mini.id);
    setForm({
      gameId: mini.gameId,
      name: mini.name,
      faction: mini.faction,
      unitType: mini.unitType,
      material: mini.material,
      status: mini.status,
      notes: mini.notes,
      image: mini.image,
    });
    setMiniModal(true);
    setDetailId("");
    setError("");
  }

  function closeMiniModal() {
    setMiniModal(false);
    setEditingId("");
    setForm(emptyForm(selectedGameId || data.games[0]?.id || ""));
    setIsSavingImage(false);
  }

  function addGame() {
    const name = text(gameName);
    if (!name) return;
    if (data.games.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      setError("A game with that name already exists.");
      return;
    }
    const game = { id: uid(), name };
    setData((current) => ({ ...current, games: [...current.games, game] }));
    setSelectedGameId(game.id);
    setGameName("");
    setGameModal(false);
    setError("");
  }

  function deleteGame(id) {
    setData((current) => ({
      games: current.games.filter((g) => g.id !== id),
      miniatures: current.miniatures.filter((m) => m.gameId !== id),
    }));
    setDetailId("");
  }

  async function changeImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setIsSavingImage(true);
      setError("");
      const image = await compressImage(file);
      setForm((current) => ({ ...current, image }));
    } catch {
      setError("Image could not be loaded. Try a smaller photo.");
    } finally {
      setIsSavingImage(false);
    }
  }

  function saveMini() {
    const gameId = text(form.gameId);
    const name = text(form.name);
    if (!gameId || !name) {
      setError("Each miniature must have a game and a name.");
      return;
    }
    if (!data.games.some((g) => g.id === gameId)) {
      setError("The selected game is no longer available.");
      return;
    }
    const payload = {
      id: editingId || uid(),
      gameId,
      name,
      faction: text(form.faction),
      unitType: text(form.unitType),
      material: text(form.material),
      status: status(form.status),
      notes: text(form.notes),
      image: typeof form.image === "string" ? form.image : "",
    };
    try {
      setData((current) => ({
        ...current,
        miniatures: editingId
          ? current.miniatures.map((m) => (m.id === editingId ? payload : m))
          : [...current.miniatures, payload],
      }));
      setError("");
      closeMiniModal();
    } catch {
      setError("Save failed. The image may be too large for browser storage. Try a smaller image.");
    }
  }

  function deleteMini(id) {
    setData((current) => ({
      ...current,
      miniatures: current.miniatures.filter((m) => m.id !== id),
    }));
    setDetailId((current) => (current === id ? "" : current));
  }

  async function copyExportText() {
    if (!exportText) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportText);
        setError("Export copied to clipboard.");
        return;
      }
    } catch {}
    setError("Copy failed. Select the export text and copy it manually.");
  }

  function exportToExcel() {
    const rows = [
      ["Game", "Model Name", "Faction", "Unit Type", "Material", "Status", "Tags", "Notes", "Has Photo"],
      ...data.miniatures.map((mini) => {
        const game = data.games.find((g) => g.id === mini.gameId);
        return [
          game?.name || "",
          mini.name,
          mini.faction,
          mini.unitType,
          mini.material,
          mini.status,
          tagsFor(mini).join(" | "),
          mini.notes,
          mini.image ? "Yes" : "No",
        ];
      }),
    ];
    const csv = downloadCsv("miniature-catalog-export.csv", rows);
    setExportText(csv);
    setExportModal(true);
  }

  return (
    <div style={ui.page}>
      <div style={{ ...ui.wrap, padding: isMobile ? 12 : 24 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: "#ffd27a", fontSize: isMobile ? 10 : 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Tactical Archive Node
          </div>
          <div style={{ fontSize: isMobile ? 24 : 34, fontWeight: 800, color: "#eff7df", textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1.1 }}>
            Miniature Catalog
          </div>
          <div style={{ color: "#8d947d", fontSize: isMobile ? 11 : 13, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6 }}>
            Index and classify model assets by game channel
          </div>
        </div>

        {failedTests.length > 0 ? (
          <div style={{ ...ui.panel, marginBottom: 16, color: "#ffd27a" }}>
            {failedTests.map((test) => (
              <div key={test.name}>{test.name}: {test.message}</div>
            ))}
          </div>
        ) : null}

        {error ? <div style={{ ...ui.panel, marginBottom: 16, color: "#ffd27a" }}>{error}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={ui.panel}><div style={{ color: "#8d947d", fontSize: 11, textTransform: "uppercase" }}>Games</div><div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: "#eff7df" }}>{data.games.length}</div></div>
          <div style={ui.panel}><div style={{ color: "#8d947d", fontSize: 11, textTransform: "uppercase" }}>Miniatures</div><div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: "#eff7df" }}>{data.miniatures.length}</div></div>
          <div style={ui.panel}><div style={{ color: "#8d947d", fontSize: 11, textTransform: "uppercase" }}>Selected Game</div><div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "#eff7df", textTransform: "uppercase", lineHeight: 1.2 }}>{selectedGame?.name || "None"}</div></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "320px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <div style={ui.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, color: "#cdddab", textTransform: "uppercase", letterSpacing: "0.14em", fontSize: isMobile ? 14 : 16 }}>Games</div>
              <button type="button" style={{ ...ui.btn, width: isMobile ? "100%" : "auto" }} onClick={() => setGameModal(true)}>Add Game</button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {data.games.length === 0 ? <div style={{ color: "#8d947d", textTransform: "uppercase", fontSize: 12 }}>No games yet.</div> : null}
              {data.games.map((game) => {
                const active = game.id === selectedGameId;
                return (
                  <div key={game.id} style={{ border: active ? "1px solid rgba(255,176,0,0.42)" : "1px solid rgba(167,188,126,0.14)", padding: 12, borderRadius: 4, background: active ? "rgba(39,34,18,0.92)" : "rgba(12,13,10,0.86)" }}>
                    <button type="button" onClick={() => setSelectedGameId(game.id)} style={{ width: "100%", background: "transparent", border: "none", color: "inherit", textAlign: "left", padding: 0, cursor: "pointer" }}>
                      <div style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.2 }}>{game.name}</div>
                      <div style={{ color: active ? "#ffd27a" : "#8d947d", fontSize: 12, marginTop: 6, textTransform: "uppercase" }}>{counts[game.id] || 0} total models</div>
                    </button>
                    <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                      <button type="button" style={{ ...ui.btnAlt, width: isMobile ? "100%" : "auto" }} onClick={() => deleteGame(game.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={ui.panel}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) auto auto", gap: 12 }}>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search miniatures" style={{ ...ui.input, flex: 1, minWidth: 0 }} />
                  <button type="button" style={{ ...ui.btn, opacity: data.games.length ? 1 : 0.6, width: "100%" }} disabled={!data.games.length} onClick={openNewMini}>Add Miniature</button>
                  <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={exportToExcel}>Export To Excel</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,320px) auto", gap: 12 }}>
                  <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...ui.input, maxWidth: "100%" }}>
                    <option value={ALL_TAGS}>All tags</option>
                    {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                  {tagFilter !== ALL_TAGS ? <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={() => setTagFilter(ALL_TAGS)}>Clear Tag Filter</button> : null}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {filtered.length === 0 ? <div style={{ ...ui.panel, color: "#8d947d", textTransform: "uppercase", fontSize: 12 }}>No miniatures match the current filter.</div> : null}
              {filtered.map((mini) => {
                const game = data.games.find((g) => g.id === mini.gameId);
                const tags = tagsFor(mini);
                return (
                  <button key={mini.id} type="button" onClick={() => setDetailId(mini.id)} style={{ ...ui.panel, textAlign: "left", cursor: "pointer", padding: isMobile ? 12 : 14 }}>
                    <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#eff7df", textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.15 }}>{mini.name}</div>
                    <div style={{ color: "#8d947d", fontSize: 12, marginTop: 6, textTransform: "uppercase", lineHeight: 1.2 }}>{game?.name || "Unknown game"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      {tags.map((tag) => <span key={tag} style={{ ...ui.badge, color: tagFilter === tag ? "#ffd27a" : "#b6c89a" }}>{tag}</span>)}
                    </div>
                    <div style={{ color: "#8d947d", fontSize: 12, marginTop: 12, textTransform: "uppercase" }}>Open dossier</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Modal open={!!detailMini} title={detailMini?.name || "Miniature"} onClose={() => setDetailId("")} isMobile={isMobile}>
          {detailMini ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ aspectRatio: "4 / 3", background: "#11140f", border: "1px solid rgba(167,188,126,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {detailMini.image ? <img src={detailMini.image} alt={detailMini.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ color: "#8d947d", textTransform: "uppercase", fontSize: 12 }}>No photo uploaded</div>}
              </div>
              <div style={{ color: "#8d947d", fontSize: 12, textTransform: "uppercase" }}>{detailGame?.name || "Unknown game"}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tagsFor(detailMini).map((tag) => (
                  <button key={tag} type="button" onClick={() => { setTagFilter(tag); setDetailId(""); }} style={{ ...ui.badge, cursor: "pointer", color: tagFilter === tag ? "#ffd27a" : "#b6c89a" }}>
                    {tag}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gap: 8, color: "#c1c9b4" }}>
                {detailMini.material ? <div><strong style={{ color: "#f0f4e7" }}>Material:</strong> {detailMini.material}</div> : null}
                {detailMini.notes ? <div><strong style={{ color: "#f0f4e7" }}>Notes:</strong> {detailMini.notes}</div> : null}
                {!detailMini.material && !detailMini.notes ? <div style={{ color: "#8d947d" }}>No additional details saved.</div> : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto auto", justifyContent: isMobile ? "stretch" : "end", gap: 10 }}>
                <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={() => openEditMini(detailMini)}>Edit</button>
                <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={() => deleteMini(detailMini.id)}>Delete</button>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal open={gameModal} title="Create Game" onClose={() => setGameModal(false)} isMobile={isMobile}>
          <div style={{ display: "grid", gap: 14 }}>
            <input value={gameName} onChange={(e) => setGameName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGame()} placeholder="Warhammer 40,000" style={ui.input} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto auto", justifyContent: isMobile ? "stretch" : "end", gap: 10 }}>
              <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={() => setGameModal(false)}>Cancel</button>
              <button type="button" style={{ ...ui.btn, width: "100%" }} onClick={addGame}>Save Game</button>
            </div>
          </div>
        </Modal>

        <Modal open={exportModal} title="Export Data" onClose={() => setExportModal(false)} isMobile={isMobile}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ color: "#8d947d", fontSize: 12, textTransform: "uppercase", lineHeight: 1.4 }}>
              If preview blocks downloads, copy this CSV text into a .csv file and open it in Excel.
            </div>
            <textarea value={exportText} readOnly rows={14} style={{ ...ui.input, resize: "vertical", minHeight: isMobile ? 220 : 260 }} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto auto", justifyContent: isMobile ? "stretch" : "end", gap: 10 }}>
              <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={copyExportText}>Copy CSV</button>
              <button type="button" style={{ ...ui.btn, width: "100%" }} onClick={() => setExportModal(false)}>Done</button>
            </div>
          </div>
        </Modal>

        <Modal open={miniModal} title={editingId ? "Edit Miniature" : "Add Miniature"} onClose={closeMiniModal} isMobile={isMobile}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <select value={form.gameId} onChange={(e) => setForm((c) => ({ ...c, gameId: e.target.value }))} style={ui.input}>
                <option value="">Select a game</option>
                {data.games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
              </select>
              <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Model name" style={ui.input} />
              <input value={form.faction} onChange={(e) => setForm((c) => ({ ...c, faction: e.target.value }))} placeholder="Faction" style={ui.input} />
              <input value={form.unitType} onChange={(e) => setForm((c) => ({ ...c, unitType: e.target.value }))} placeholder="Unit type" style={ui.input} />
              <input value={form.material} onChange={(e) => setForm((c) => ({ ...c, material: e.target.value }))} placeholder="Material" style={ui.input} />
              <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))} style={ui.input}>
                {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div style={{ ...ui.panel, padding: 14 }}>
              <input type="file" accept="image/*" onChange={changeImage} style={{ color: "#d3dcc7", width: "100%" }} />
              {isSavingImage ? <div style={{ color: "#8d947d", fontSize: 12, marginTop: 10, textTransform: "uppercase" }}>Processing image...</div> : null}
              {form.image ? <img src={form.image} alt="Miniature preview" style={{ marginTop: 12, width: "100%", maxHeight: 240, objectFit: "cover" }} /> : null}
            </div>
            <textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Notes" rows={5} style={{ ...ui.input, resize: "vertical" }} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto auto", justifyContent: isMobile ? "stretch" : "end", gap: 10 }}>
              <button type="button" style={{ ...ui.btnAlt, width: "100%" }} onClick={closeMiniModal}>Cancel</button>
              <button type="button" style={{ ...ui.btn, width: "100%", opacity: isSavingImage ? 0.6 : 1 }} onClick={saveMini} disabled={isSavingImage}>Save Miniature</button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

export { MiniatureCatalogApp };
export default MiniatureCatalogApp;
