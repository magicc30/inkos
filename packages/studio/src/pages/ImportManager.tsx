import { useEffect, useRef, useState } from "react";
import { fetchJson, invalidateApiPaths, useApi, postApi } from "../hooks/use-api";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useI18n } from "../hooks/use-i18n";
import { useColors } from "../hooks/use-colors";
import { tr } from "../lib/app-language";
import { FileInput, BookCopy, Feather, BookMarked, Wand2, Upload, RefreshCw } from "lucide-react";
import { waitForStudioBookReady } from "../lib/book-ready";

interface BookSummary {
  readonly id: string;
  readonly title: string;
}

interface Nav { toDashboard: () => void; toBook: (bookId: string) => void }

type Tab = "chapters" | "canon" | "fanfic" | "spinoff" | "imitation" | "import-text" | "rewrite-style";

export function ImportManager({ nav, theme, t, initialTab }: { nav: Nav; theme: Theme; t: TFunction; initialTab?: Tab }) {
  const c = useColors(theme);
  const { lang } = useI18n();
  const { data: booksData } = useApi<{ books: ReadonlyArray<BookSummary> }>("/books");
  const [tab, setTab] = useState<Tab>(initialTab ?? "chapters");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // Chapters state
  const [chText, setChText] = useState("");
  const [chBookId, setChBookId] = useState("");
  const [chSplitRegex, setChSplitRegex] = useState("");

  // Canon state
  const [canonTarget, setCanonTarget] = useState("");
  const [canonFrom, setCanonFrom] = useState("");

  // Fanfic state
  const [ffTitle, setFfTitle] = useState("");
  const [ffText, setFfText] = useState("");
  const [ffMode, setFfMode] = useState("canon");
  const [ffGenre, setFfGenre] = useState("other");
  const [ffLang, setFfLang] = useState(lang);

  // Spinoff (番外) state
  const [spTitle, setSpTitle] = useState("");
  const [spParent, setSpParent] = useState("");
  const [spDirection, setSpDirection] = useState("");

  // Imitation (仿写) state
  const [imTitle, setImTitle] = useState("");
  const [imRef, setImRef] = useState("");
  const [imIdea, setImIdea] = useState("");
  const [imGenre, setImGenre] = useState("other");
  const [imLang, setImLang] = useState(lang);

  // Import Text (导入建书) state
  const [itTitle, setItTitle] = useState("");
  const [itText, setItText] = useState("");
  const [itSplitRegex, setItSplitRegex] = useState("");
  const [itGenre, setItGenre] = useState("other");
  const [itLang, setItLang] = useState(lang);
  // Rewrite Style (重写文风) state
  const [rwBookId, setRwBookId] = useState("");
  const [rwStartFrom, setRwStartFrom] = useState("");
  const [rwEndAt, setRwEndAt] = useState("");
  const [itFileName, setItFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setItFileName(file.name);
    const text = await file.text();
    setItText(text);
    if (!itTitle.trim()) {
      const baseName = file.name.replace(/\.(txt|md|text)$/i, "");
      setItTitle(baseName);
    }
  };

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
      setStatus("");
    }
  }, [initialTab]);

  const handleImportChapters = async () => {
    if (!chText.trim() || !chBookId) return;
    setLoading(true);
    setStatus("");
    try {
      const data = await fetchJson<{ importedCount?: number }>(`/books/${chBookId}/import/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chText, splitRegex: chSplitRegex || undefined }),
      });
      setStatus(`Imported ${data.importedCount} chapters`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleImportCanon = async () => {
    if (!canonTarget || !canonFrom) return;
    setLoading(true);
    setStatus("");
    try {
      await postApi(`/books/${canonTarget}/import/canon`, { fromBookId: canonFrom });
      setStatus("Canon imported successfully!");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleFanficInit = async () => {
    if (!ffTitle.trim() || !ffText.trim()) return;
    setLoading(true);
    setStatus("");
    try {
      const data = await fetchJson<{ bookId?: string }>("/fanfic/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ffTitle, sourceText: ffText, mode: ffMode,
          genre: ffGenre, language: ffLang,
        }),
      });
      if (data.bookId) {
        setStatus(`${t("import.creating")}: ${data.bookId}`);
        await waitForStudioBookReady(data.bookId);
        setStatus(`${t("import.fanficDone")}: ${data.bookId}`);
        invalidateApiPaths(["/api/v1/books", `/api/v1/books/${data.bookId}`]);
        nav.toBook(data.bookId);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleSpinoffInit = async () => {
    if (!spTitle.trim() || !spParent) return;
    setLoading(true);
    setStatus("");
    try {
      const data = await postApi<{ bookId?: string }>("/spinoff/init", { title: spTitle, parentBookId: spParent, direction: spDirection || undefined });
      if (data.bookId) {
        setStatus(`${t("import.creating")}: ${data.bookId}`);
        await waitForStudioBookReady(data.bookId);
        setStatus(`${t("import.spinoffDone")}: ${data.bookId}`);
        invalidateApiPaths(["/api/v1/books", `/api/v1/books/${data.bookId}`]);
        nav.toBook(data.bookId);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleImitationInit = async () => {
    if (!imTitle.trim() || !imRef.trim() || !imIdea.trim()) return;
    setLoading(true);
    setStatus("");
    try {
      const data = await postApi<{ bookId?: string }>("/imitation/init", { title: imTitle, referenceText: imRef, storyIdea: imIdea, genre: imGenre, language: imLang });
      if (data.bookId) {
        setStatus(`${t("import.creating")}: ${data.bookId}`);
        await waitForStudioBookReady(data.bookId);
        setStatus(`${t("import.imitationDone")}: ${data.bookId}`);
        invalidateApiPaths(["/api/v1/books", `/api/v1/books/${data.bookId}`]);
        nav.toBook(data.bookId);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleImportText = async () => {
    if (!itTitle.trim() || !itText.trim()) return;
    setLoading(true);
    setStatus("");
    try {
      const data = await postApi<{ bookId?: string; importedCount?: number }>("/books/import-text", {
        title: itTitle,
        text: itText,
        splitRegex: itSplitRegex || undefined,
        genre: itGenre,
        language: itLang,
      });
      if (data.bookId) {
        setStatus(`${t("import.creating")}: ${data.bookId}`);
        await waitForStudioBookReady(data.bookId);
        setStatus(`${t("import.importTextDone")}: ${data.bookId} (${data.importedCount} chapters)`);
        invalidateApiPaths(["/api/v1/books", `/api/v1/books/${data.bookId}`]);
        nav.toBook(data.bookId);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleRewriteStyle = async () => {
    if (!rwBookId) return;
    setLoading(true);
    setStatus("");
    try {
      const data = await postApi<{ ok?: boolean; rewrittenCount?: number; chapters?: Array<{ number: number; title: string; wordCount: number; ok: boolean }> }>("/books/" + rwBookId + "/rewrite-all", {
        startFrom: rwStartFrom ? parseInt(rwStartFrom) : undefined,
        endAt: rwEndAt ? parseInt(rwEndAt) : undefined,
      });
      if (data.ok) {
        const failed = data.chapters?.filter(ch => !ch.ok).length ?? 0;
        setStatus(`${t("import.rewriteDone")}: ${data.rewrittenCount} chapters rewritten${failed > 0 ? `, ${failed} failed` : ""}`);
        invalidateApiPaths(["/api/v1/books", `/api/v1/books/${rwBookId}`]);
      } else {
        setStatus(`${t("import.rewriteDone")}: ${data.rewrittenCount ?? 0} chapters`);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const tabGroups: { label: string; tabs: { id: Tab; label: string; icon: React.ReactNode }[] }[] = [
    {
      label: t("import.groupBasic"),
      tabs: [
        { id: "import-text", label: t("import.importText"), icon: <Upload size={14} /> },
        { id: "chapters", label: t("import.chapters"), icon: <FileInput size={14} /> },
        { id: "canon", label: t("import.canon"), icon: <BookCopy size={14} /> },
      ],
    },
    {
      label: t("import.groupCreative"),
      tabs: [
        { id: "fanfic", label: t("import.fanfic"), icon: <Feather size={14} /> },
        { id: "spinoff", label: t("import.spinoff"), icon: <BookMarked size={14} /> },
        { id: "imitation", label: t("import.imitation"), icon: <Wand2 size={14} /> },
        { id: "rewrite-style", label: t("import.rewriteStyle"), icon: <RefreshCw size={14} /> },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={nav.toDashboard} className={c.link}>{t("bread.home")}</button>
        <span className="text-border">/</span>
        <span>{t("nav.import")}</span>
      </div>

      <h1 className="font-serif text-3xl flex items-center gap-3">
        <FileInput size={28} className="text-primary" />
        {t("import.title")}
      </h1>

      {/* Tabs */}
      <div className="space-y-2">
        {tabGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-1">{group.label}</p>
            <div className="flex gap-1 bg-secondary/30 rounded-lg p-1 w-fit">
              {group.tabs.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => { setTab(tb.id); setStatus(""); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                    tab === tb.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tb.icon} {tb.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div className={`border ${c.cardStatic} rounded-lg p-6 space-y-4`}>
        {tab === "import-text" && (
          <>
            <p className="text-xs text-muted-foreground">{t("import.importTextHint")}</p>
            <input type="text" value={itTitle} onChange={(e) => setItTitle(e.target.value)}
              placeholder={t("import.importTextTitle")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
            />
            <div className="grid grid-cols-3 gap-3">
              <select value={itGenre} onChange={(e) => setItGenre(e.target.value)}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="other">其他</option>
                <option value="xuanhuan">玄幻</option>
                <option value="urban">都市</option>
                <option value="xianxia">仙侠</option>
                <option value="sci-fi">科幻</option>
                <option value="romance">言情</option>
              </select>
              <select value={itLang} onChange={(e) => setItLang(e.target.value as "zh" | "en")}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
              <input
                type="text" value={itSplitRegex} onChange={(e) => setItSplitRegex(e.target.value)}
                placeholder={t("import.splitRegex")}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm font-mono"
              />
            </div>
            <textarea value={itText} onChange={(e) => { setItText(e.target.value); setItFileName(""); }} rows={14}
              placeholder={t("import.pasteText")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none font-mono"
            />
            <input
              ref={fileInputRef} type="file" accept=".txt,.md,.text" className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex items-center gap-3">
              <button onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary/30 flex items-center gap-2">
                <Upload size={14} />
                {itFileName ? itFileName : t("import.selectFile")}
              </button>
              {itFileName && (
                <button onClick={() => { setItText(""); setItFileName(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-xs text-muted-foreground hover:text-destructive underline">
                  {t("import.clearFile")}
                </button>
              )}
              <button onClick={handleImportText} disabled={loading || !itTitle.trim() || !itText.trim()}
                className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}>
                {loading ? t("import.creating") : t("import.importText")}
              </button>
            </div>
          </>
        )}

        {tab === "chapters" && (
          <>
            <select value={chBookId} onChange={(e) => setChBookId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
              <option value="">{t("import.selectTarget")}</option>
              {booksData?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <input
              type="text" value={chSplitRegex} onChange={(e) => setChSplitRegex(e.target.value)}
              placeholder={t("import.splitRegex")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm font-mono"
            />
            <textarea value={chText} onChange={(e) => setChText(e.target.value)} rows={10}
              placeholder={t("import.pasteChapters")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none font-mono"
            />
            <button onClick={handleImportChapters} disabled={loading || !chBookId || !chText.trim()}
              className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}>
              {loading ? t("import.importing") : t("import.chapters")}
            </button>
          </>
        )}

        {tab === "canon" && (
          <>
            <select value={canonFrom} onChange={(e) => setCanonFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
              <option value="">{t("import.selectSource")}</option>
              {booksData?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <select value={canonTarget} onChange={(e) => setCanonTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
              <option value="">{t("import.selectDerivative")}</option>
              {booksData?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <button onClick={handleImportCanon} disabled={loading || !canonTarget || !canonFrom}
              className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}>
              {loading ? t("import.importing") : t("import.canon")}
            </button>
          </>
        )}

        {tab === "fanfic" && (
          <>
            <input type="text" value={ffTitle} onChange={(e) => setFfTitle(e.target.value)}
              placeholder={t("import.fanficTitle")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
            />
            <div className="grid grid-cols-3 gap-3">
              <select value={ffMode} onChange={(e) => setFfMode(e.target.value)}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="canon">{tr("原著向", "Canon-compliant")}</option>
                <option value="au">{tr("架空 AU", "Alternate Universe (AU)")}</option>
                <option value="ooc">{tr("性格偏离 OOC", "Out of Character (OOC)")}</option>
                <option value="cp">{tr("配对 CP", "Pairing (CP)")}</option>
              </select>
              <select value={ffGenre} onChange={(e) => setFfGenre(e.target.value)}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="other">{tr("其他", "Other")}</option>
                <option value="xuanhuan">{tr("玄幻", "Xuanhuan Fantasy")}</option>
                <option value="urban">{tr("都市", "Urban")}</option>
                <option value="xianxia">{tr("仙侠", "Xianxia")}</option>
              </select>
              <select value={ffLang} onChange={(e) => setFfLang(e.target.value as "zh" | "en")}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="zh">{tr("中文", "Chinese")}</option>
                <option value="en">English</option>
              </select>
            </div>
            <textarea value={ffText} onChange={(e) => setFfText(e.target.value)} rows={10}
              placeholder={t("import.pasteMaterial")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none font-mono"
            />
            <button onClick={handleFanficInit} disabled={loading || !ffTitle.trim() || !ffText.trim()}
              className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}>
              {loading ? t("import.creating") : t("import.fanfic")}
            </button>
          </>
        )}

        {tab === "spinoff" && (
          <>
            <p className="text-xs text-muted-foreground">{t("import.spinoffHint")}</p>
            <input type="text" value={spTitle} onChange={(e) => setSpTitle(e.target.value)}
              placeholder={t("import.spinoffTitle")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
            />
            <select value={spParent} onChange={(e) => setSpParent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
              <option value="">{t("import.selectParent")}</option>
              {booksData?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <textarea value={spDirection} onChange={(e) => setSpDirection(e.target.value)} rows={5}
              placeholder={t("import.spinoffDirection")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none"
            />
            <button onClick={handleSpinoffInit} disabled={loading || !spTitle.trim() || !spParent}
              className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}>
              {loading ? t("import.creating") : t("import.spinoff")}
            </button>
          </>
        )}

        {tab === "imitation" && (
          <>
            <p className="text-xs text-muted-foreground">{t("import.imitationHint")}</p>
            <input type="text" value={imTitle} onChange={(e) => setImTitle(e.target.value)}
              placeholder={t("import.imitationTitle")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select value={imGenre} onChange={(e) => setImGenre(e.target.value)}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="other">{tr("其他", "Other")}</option>
                <option value="xuanhuan">{tr("玄幻", "Xuanhuan Fantasy")}</option>
                <option value="urban">{tr("都市", "Urban")}</option>
                <option value="xianxia">{tr("仙侠", "Xianxia")}</option>
              </select>
              <select value={imLang} onChange={(e) => setImLang(e.target.value as "zh" | "en")}
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
                <option value="zh">{tr("中文", "Chinese")}</option>
                <option value="en">English</option>
              </select>
            </div>
            <textarea value={imIdea} onChange={(e) => setImIdea(e.target.value)} rows={4}
              placeholder={t("import.imitationIdea")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none"
            />
            <textarea value={imRef} onChange={(e) => setImRef(e.target.value)} rows={8}
              placeholder={t("import.imitationRef")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none font-mono"
            />
            <button onClick={handleImitationInit} disabled={loading || !imTitle.trim() || !imRef.trim() || !imIdea.trim()}
              className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}>
              {loading ? t("import.creating") : t("import.imitation")}
            </button>
          </>
        )}


        {tab === "rewrite-style" && (
          <>
            <p className="text-xs text-muted-foreground">{t("import.rewriteStyleHint")}</p>
            <select value={rwBookId} onChange={(e) => setRwBookId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm">
              <option value="">{t("import.selectBook")}</option>
              {booksData?.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={rwStartFrom} onChange={(e) => setRwStartFrom(e.target.value)}
                placeholder={t("import.rewriteFrom")} min="1"
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
              />
              <input type="number" value={rwEndAt} onChange={(e) => setRwEndAt(e.target.value)}
                placeholder={t("import.rewriteTo")} min="1"
                className="px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
              />
            </div>
            <button onClick={handleRewriteStyle} disabled={loading || !rwBookId}
              className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30 flex items-center gap-2`}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? t("import.rewriting") : t("import.rewriteStyle")}
            </button>
          </>
        )}
        {status && (
          <div className={`text-sm px-3 py-2 rounded-lg ${status.startsWith("Error") ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
