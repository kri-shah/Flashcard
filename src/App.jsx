import { useEffect, useMemo, useReducer, useRef, useState } from "react";

const STORAGE_KEY = "flashcard_app_data";
const LAST_BACKUP_KEY = "lastBackupPrompt";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const emptyData = () => ({ version: 1, decks: [] });

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.decks)) return emptyData();
    return { version: 1, decks: parsed.decks };
  } catch {
    return emptyData();
  }
};

const persist = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
};

const formatDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

const todayFilename = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `flashcards-backup-${y}-${m}-${day}.json`;
};

const downloadJson = (data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = todayFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const dataReducer = (state, action) => {
  switch (action.type) {
    case "set":
      return action.data;
    case "addDeck": {
      const deck = {
        id: crypto.randomUUID(),
        name: action.name.trim() || "Untitled deck",
        createdAt: new Date().toISOString(),
        cards: [],
      };
      return { ...state, decks: [deck, ...state.decks] };
    }
    case "deleteDeck":
      return {
        ...state,
        decks: state.decks.filter((d) => d.id !== action.id),
      };
    case "renameDeck":
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id === action.id ? { ...d, name: action.name } : d
        ),
      };
    case "addCard":
      return {
        ...state,
        decks: state.decks.map((d) =>
          d.id === action.deckId
            ? { ...d, cards: [...d.cards, { front: "", back: "" }] }
            : d
        ),
      };
    case "updateCard":
      return {
        ...state,
        decks: state.decks.map((d) => {
          if (d.id !== action.deckId) return d;
          const cards = d.cards.map((c, i) =>
            i === action.index ? { ...c, [action.field]: action.value } : c
          );
          return { ...d, cards };
        }),
      };
    case "deleteCard":
      return {
        ...state,
        decks: state.decks.map((d) => {
          if (d.id !== action.deckId) return d;
          return {
            ...d,
            cards: d.cards.filter((_, i) => i !== action.index),
          };
        }),
      };
    case "mergeImport": {
      const existing = new Map(state.decks.map((d) => [d.id, d]));
      for (const d of action.decks) {
        if (!d || typeof d !== "object") continue;
        if (existing.has(d.id)) continue;
        existing.set(d.id, {
          id: d.id || crypto.randomUUID(),
          name: typeof d.name === "string" ? d.name : "Imported deck",
          createdAt: d.createdAt || new Date().toISOString(),
          cards: Array.isArray(d.cards)
            ? d.cards
                .filter((c) => c && typeof c === "object")
                .map((c) => ({
                  front: typeof c.front === "string" ? c.front : "",
                  back: typeof c.back === "string" ? c.back : "",
                }))
            : [],
        });
      }
      return { ...state, decks: Array.from(existing.values()) };
    }
    default:
      return state;
  }
};

const FontStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');

    .flip-scene { perspective: 1200px; }
    .flip-card {
      position: relative;
      width: 100%;
      height: 100%;
      transition: transform 0.4s ease;
      transform-style: preserve-3d;
    }
    .flip-card.flipped { transform: rotateY(180deg); }
    .flip-face {
      position: absolute;
      inset: 0;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      border-radius: 4px;
      border: 1px solid #2a2a2a;
      text-align: center;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .flip-front { background: #161616; }
    .flip-back {
      background: #1f1f1f;
      transform: rotateY(180deg);
      border-color: #3a3a3a;
    }

    input, textarea, button {
      font-family: inherit;
    }
    input::placeholder, textarea::placeholder { color: #5a5a5a; }

    /* Hover-only transitions, no scale */
    .ui-btn {
      transition: opacity 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
    }
    .ui-btn:hover { opacity: 0.85; }
  `}</style>
);

const Toast = ({ onExport, onDismiss }) => (
  <div className="w-full border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
    <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 text-sm">
      <span className="text-bone/90 flex-1">
        It&rsquo;s been a while &mdash; consider downloading a backup.
      </span>
      <button
        type="button"
        onClick={onExport}
        className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone/60 text-bone"
      >
        Export
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="ui-btn min-h-[44px] min-w-[44px] px-3 border border-transparent hover:border-zinc-700 text-bone/70 hover:text-bone"
      >
        ×
      </button>
    </div>
  </div>
);

const NewDeckRow = ({ onCreate, onCancel }) => {
  const [name, setName] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    onCreate(trimmed);
  };
  return (
    <div className="flex items-stretch border border-zinc-800">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="deck name"
        className="flex-1 min-h-[44px] bg-transparent px-4 outline-none text-bone"
      />
      <button
        type="button"
        onClick={submit}
        className="ui-btn min-h-[44px] px-4 border-l border-zinc-800 text-bone hover:bg-zinc-900"
      >
        create
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="ui-btn min-h-[44px] px-4 border-l border-zinc-800 text-bone/60 hover:text-bone hover:bg-zinc-900"
      >
        cancel
      </button>
    </div>
  );
};

const DeckRow = ({ deck, onStudy, onEdit, onDelete }) => (
  <div className="grid grid-cols-12 gap-4 items-center border border-zinc-800 px-4 py-3 hover:border-zinc-600 ui-btn">
    <div className="col-span-12 md:col-span-5">
      <div className="text-bone text-base">{deck.name}</div>
      <div className="text-bone/40 text-xs mt-1">
        created {formatDate(deck.createdAt)}
      </div>
    </div>
    <div className="col-span-4 md:col-span-2 text-bone/60 text-sm">
      {deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}
    </div>
    <div className="col-span-8 md:col-span-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onStudy}
        className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
      >
        study
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
      >
        edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${deck.name}`}
        className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-red-400 text-bone/70 hover:text-red-300"
      >
        delete
      </button>
    </div>
  </div>
);

const Home = ({
  decks,
  onNewDeck,
  onStudy,
  onEdit,
  onDelete,
  onImportClick,
  onExport,
}) => {
  const [creating, setCreating] = useState(false);
  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8">
      <header className="flex items-end justify-between border-b border-zinc-800 pb-4 mb-6 gap-4">
        <div>
          <h1 className="text-2xl text-bone tracking-tight">flashcards</h1>
          <p className="text-bone/40 text-xs mt-1">
            {decks.length} deck{decks.length === 1 ? "" : "s"} ·{" "}
            {decks.reduce((n, d) => n + d.cards.length, 0)} cards
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
          >
            + new deck
          </button>
          <button
            type="button"
            onClick={onImportClick}
            className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
          >
            import
          </button>
          <button
            type="button"
            onClick={onExport}
            className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
          >
            export all
          </button>
        </div>
      </header>

      {creating && (
        <div className="mb-4">
          <NewDeckRow
            onCreate={(name) => {
              onNewDeck(name);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {decks.length === 0 && !creating ? (
        <div className="border border-dashed border-zinc-800 px-6 py-16 text-center text-bone/40 text-sm">
          no decks yet. press{" "}
          <span className="text-bone/70">+ new deck</span> to start, or{" "}
          <span className="text-bone/70">import</span> a backup file.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {decks.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              onStudy={() => onStudy(deck.id)}
              onEdit={() => onEdit(deck.id)}
              onDelete={() => onDelete(deck.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CardRow = ({ index, card, onChange, onDelete }) => (
  <div className="grid grid-cols-12 gap-2 items-stretch border border-zinc-800">
    <div className="col-span-1 flex items-center justify-center text-bone/30 text-xs border-r border-zinc-800 min-h-[44px]">
      {index + 1}
    </div>
    <input
      type="text"
      value={card.front}
      onChange={(e) => onChange("front", e.target.value)}
      placeholder="front"
      className="col-span-5 bg-transparent px-3 py-2 min-h-[44px] outline-none text-bone border-r border-zinc-800 focus:bg-zinc-900"
    />
    <input
      type="text"
      value={card.back}
      onChange={(e) => onChange("back", e.target.value)}
      placeholder="back"
      className="col-span-5 bg-transparent px-3 py-2 min-h-[44px] outline-none text-bone focus:bg-zinc-900"
    />
    <button
      type="button"
      onClick={onDelete}
      aria-label={`Delete card ${index + 1}`}
      className="ui-btn col-span-1 min-h-[44px] border-l border-zinc-800 text-bone/40 hover:text-red-300 hover:bg-zinc-900"
    >
      ×
    </button>
  </div>
);

const Editor = ({ deck, onBack, onAddCard, onUpdateCard, onDeleteCard, onRename }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(deck.name);
  useEffect(() => {
    setNameDraft(deck.name);
  }, [deck.name]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== deck.name) onRename(trimmed);
    setEditingName(false);
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8">
      <header className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="ui-btn min-h-[44px] px-3 border border-zinc-700 hover:border-bone text-bone"
          >
            ← back
          </button>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNameDraft(deck.name);
                  setEditingName(false);
                }
              }}
              className="flex-1 min-h-[44px] bg-transparent px-3 outline-none text-bone border border-zinc-700"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="ui-btn text-2xl text-bone tracking-tight truncate text-left"
              title="Rename deck"
            >
              {deck.name}
            </button>
          )}
        </div>
        <div className="text-bone/40 text-xs whitespace-nowrap">
          {deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}
        </div>
      </header>

      {deck.cards.length === 0 ? (
        <div className="border border-dashed border-zinc-800 px-6 py-12 text-center text-bone/40 text-sm mb-4">
          no cards in this deck. add one below.
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {deck.cards.map((card, i) => (
            <CardRow
              key={i}
              index={i}
              card={card}
              onChange={(field, value) => onUpdateCard(i, field, value)}
              onDelete={() => onDeleteCard(i)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAddCard}
        className="ui-btn w-full min-h-[44px] border border-dashed border-zinc-700 hover:border-bone text-bone/70 hover:text-bone"
      >
        + add card
      </button>
    </div>
  );
};

const Study = ({ deck, onBack }) => {
  const [shuffle, setShuffle] = useState(false);
  const [order, setOrder] = useState(() => deck.cards.map((_, i) => i));
  const [known, setKnown] = useState(() => new Set());
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    let next = deck.cards.map((_, i) => i);
    if (shuffle) {
      next = [...next];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
  }, [shuffle, deck.cards.length]);

  const visible = useMemo(
    () => order.filter((idx) => !known.has(idx)),
    [order, known]
  );

  const safePos = visible.length === 0 ? 0 : Math.min(pos, visible.length - 1);
  const currentCardIndex = visible.length > 0 ? visible[safePos] : null;
  const currentCard =
    currentCardIndex !== null ? deck.cards[currentCardIndex] : null;

  const goPrev = () => {
    if (visible.length === 0) return;
    setFlipped(false);
    setPos((p) => (p - 1 + visible.length) % visible.length);
  };
  const goNext = () => {
    if (visible.length === 0) return;
    setFlipped(false);
    setPos((p) => (p + 1) % visible.length);
  };
  const flip = () => setFlipped((f) => !f);

  const markKnown = () => {
    if (currentCardIndex === null) return;
    setKnown((prev) => {
      const next = new Set(prev);
      next.add(currentCardIndex);
      return next;
    });
    setFlipped(false);
    setPos((p) => {
      const remaining = visible.length - 1;
      if (remaining <= 0) return 0;
      return p >= remaining ? 0 : p;
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible.length]);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8">
      <header className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="ui-btn min-h-[44px] px-3 border border-zinc-700 hover:border-bone text-bone"
          >
            ← back
          </button>
          <h1 className="text-xl text-bone tracking-tight truncate">
            {deck.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-bone/70 text-sm cursor-pointer select-none min-h-[44px]">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="accent-bone w-4 h-4"
            />
            shuffle
          </label>
          <span className="text-bone/40 text-sm tabular-nums">
            {visible.length === 0
              ? "0 / 0"
              : `${safePos + 1} / ${visible.length}`}
          </span>
        </div>
      </header>

      {deck.cards.length === 0 ? (
        <div className="border border-dashed border-zinc-800 px-6 py-16 text-center text-bone/40 text-sm">
          this deck has no cards yet.
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-zinc-800 px-6 py-16 text-center text-bone/40 text-sm">
          all cards marked known. nice work.
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setKnown(new Set());
                setPos(0);
                setFlipped(false);
              }}
              className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
            >
              reset session
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={flip}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flip();
              }
            }}
            className="flip-scene w-full select-none cursor-pointer"
            aria-label="Flip card"
          >
            <div
              className="relative w-full"
              style={{ height: "min(60vh, 420px)", minHeight: 240 }}
            >
              <div className={`flip-card ${flipped ? "flipped" : ""}`}>
                <div className="flip-face flip-front">
                  <div className="text-bone text-2xl md:text-3xl leading-relaxed">
                    {currentCard?.front || (
                      <span className="text-bone/30">(empty front)</span>
                    )}
                  </div>
                </div>
                <div className="flip-face flip-back">
                  <div className="text-bone text-2xl md:text-3xl leading-relaxed">
                    {currentCard?.back || (
                      <span className="text-bone/30">(empty back)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-bone/40 text-xs">
              space: flip · ← →: prev / next
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={goPrev}
                className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
              >
                ← prev
              </button>
              <button
                type="button"
                onClick={flip}
                className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
              >
                flip
              </button>
              <button
                type="button"
                onClick={markKnown}
                className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
              >
                mark known
              </button>
              <button
                type="button"
                onClick={goNext}
                className="ui-btn min-h-[44px] px-4 border border-zinc-700 hover:border-bone text-bone"
              >
                next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default function App() {
  const [data, dispatch] = useReducer(dataReducer, undefined, loadData);
  const [view, setView] = useState("home");
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [showBackup, setShowBackup] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    persist(data);
  }, [data]);

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_BACKUP_KEY);
      if (!last) {
        setShowBackup(true);
        return;
      }
      const ts = Number(last);
      if (!Number.isFinite(ts) || Date.now() - ts > SEVEN_DAYS_MS) {
        setShowBackup(true);
      }
    } catch {
      setShowBackup(true);
    }
  }, []);

  const stampBackup = () => {
    try {
      localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setShowBackup(false);
  };

  const handleExport = () => {
    downloadJson(data);
    stampBackup();
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const decks = Array.isArray(parsed?.decks) ? parsed.decks : [];
      if (decks.length === 0) {
        alert("No decks found in file.");
        return;
      }
      dispatch({ type: "mergeImport", decks });
    } catch {
      alert("Failed to import: not a valid JSON file.");
    }
  };

  const activeDeck = useMemo(
    () => data.decks.find((d) => d.id === activeDeckId) || null,
    [data.decks, activeDeckId]
  );

  useEffect(() => {
    if ((view === "study" || view === "editor") && !activeDeck) {
      setView("home");
      setActiveDeckId(null);
    }
  }, [view, activeDeck]);

  return (
    <div className="min-h-full bg-ink text-bone">
      <FontStyle />

      {showBackup && (
        <Toast onExport={handleExport} onDismiss={stampBackup} />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportChange}
        className="hidden"
      />

      {view === "home" && (
        <Home
          decks={data.decks}
          onNewDeck={(name) => dispatch({ type: "addDeck", name })}
          onStudy={(id) => {
            setActiveDeckId(id);
            setView("study");
          }}
          onEdit={(id) => {
            setActiveDeckId(id);
            setView("editor");
          }}
          onDelete={(id) => {
            const d = data.decks.find((x) => x.id === id);
            const ok = window.confirm(
              `Delete deck "${d?.name || ""}"? This cannot be undone.`
            );
            if (ok) dispatch({ type: "deleteDeck", id });
          }}
          onImportClick={handleImportClick}
          onExport={handleExport}
        />
      )}

      {view === "editor" && activeDeck && (
        <Editor
          deck={activeDeck}
          onBack={() => {
            setView("home");
            setActiveDeckId(null);
          }}
          onAddCard={() =>
            dispatch({ type: "addCard", deckId: activeDeck.id })
          }
          onUpdateCard={(index, field, value) =>
            dispatch({
              type: "updateCard",
              deckId: activeDeck.id,
              index,
              field,
              value,
            })
          }
          onDeleteCard={(index) =>
            dispatch({ type: "deleteCard", deckId: activeDeck.id, index })
          }
          onRename={(name) =>
            dispatch({ type: "renameDeck", id: activeDeck.id, name })
          }
        />
      )}

      {view === "study" && activeDeck && (
        <Study
          deck={activeDeck}
          onBack={() => {
            setView("home");
            setActiveDeckId(null);
          }}
        />
      )}
    </div>
  );
}
