import { useEffect, useMemo, useState } from "react";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useColors } from "../hooks/use-colors";
import { fetchJson, useApi } from "../hooks/use-api";
import { Download, FileText, Languages, Loader2, Play, Upload } from "lucide-react";

interface Nav { toDashboard: () => void }

interface TranslationSummary {
  readonly projectId: string;
  readonly title: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly chapters: number;
}

interface TranslationListResponse {
  readonly translations: ReadonlyArray<TranslationSummary>;
}

interface TranslationManifest {
  readonly projectId: string;
  readonly title: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly chapters: ReadonlyArray<{ readonly chapterId: string; readonly title: string; readonly status: string }>;
}

interface TranslationDetailResponse {
  readonly manifest: TranslationManifest;
  readonly report: string;
}

interface TranslationUploadResponse {
  readonly storedPath: string;
  readonly size: number;
  readonly mimeType: string;
}

interface TranslationCreateResponse {
  readonly projectId: string;
  readonly title: string;
}

interface TranslationRunResponse {
  readonly translatedSegments: number;
  readonly reviewedChapters: number;
  readonly reportPath: string;
}

interface TranslationExportResponse {
  readonly outputPath: string;
  readonly format: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TranslationManager({ nav, theme, t }: { nav: Nav; theme: Theme; t: TFunction }) {
  const c = useColors(theme);
  const isZh = t("nav.connected") === "已连接";
  const { data, loading, error, refetch } = useApi<TranslationListResponse>("/translations");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<TranslationDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"upload" | "create" | "run" | "export" | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<TranslationUploadResponse | null>(null);
  const [title, setTitle] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState(isZh ? "zh" : "en");
  const [segmentMaxChars, setSegmentMaxChars] = useState(1200);

  const translations = data?.translations ?? [];
  const selected = useMemo(
    () => translations.find((item) => item.projectId === selectedId) ?? translations[0],
    [translations, selectedId],
  );

  useEffect(() => {
    if (!selected?.projectId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    fetchJson<TranslationDetailResponse>(`/translations/${encodeURIComponent(selected.projectId)}`)
      .then(setDetail)
      .catch((err) => setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setDetailLoading(false));
  }, [selected?.projectId]);

  const uploadFile = async () => {
    if (!file) return;
    setBusy("upload");
    setStatus("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetchJson<TranslationUploadResponse>("/translations/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, dataUrl }),
      });
      setUploaded(res);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/u, ""));
      setStatus(isZh ? `已上传：${res.storedPath}` : `Uploaded: ${res.storedPath}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy("");
    }
  };

  const createProject = async () => {
    if (!uploaded?.storedPath) return;
    setBusy("create");
    setStatus("");
    try {
      const res = await fetchJson<TranslationCreateResponse>("/translations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: uploaded.storedPath,
          sourceLanguage,
          targetLanguage,
          title: title.trim() || undefined,
          segmentMaxChars,
        }),
      });
      setSelectedId(res.projectId);
      setStatus(isZh ? `已创建翻译项目：${res.title}` : `Created translation project: ${res.title}`);
      await refetch();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy("");
    }
  };

  const runProject = async () => {
    if (!selected?.projectId) return;
    setBusy("run");
    setStatus("");
    try {
      const res = await fetchJson<TranslationRunResponse>(`/translations/${encodeURIComponent(selected.projectId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 8 }),
      });
      setStatus(isZh
        ? `翻译 ${res.translatedSegments} 段，审校 ${res.reviewedChapters} 章。报告：${res.reportPath}`
        : `Translated ${res.translatedSegments} segments, reviewed ${res.reviewedChapters} chapters. Report: ${res.reportPath}`);
      await refetch();
      const updated = await fetchJson<TranslationDetailResponse>(`/translations/${encodeURIComponent(selected.projectId)}`);
      setDetail(updated);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy("");
    }
  };

  const exportProject = async (format: "md" | "txt" | "epub") => {
    if (!selected?.projectId) return;
    setBusy("export");
    setStatus("");
    try {
      const res = await fetchJson<TranslationExportResponse>(`/translations/${encodeURIComponent(selected.projectId)}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      setStatus(isZh ? `已导出 ${format}: ${res.outputPath}` : `Exported ${format}: ${res.outputPath}`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={nav.toDashboard} className={c.link}>{t("bread.home")}</button>
        <span className="text-border">/</span>
        <span>{t("nav.translation")}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-3">
            <Languages size={28} className="text-primary" />
            {t("translation.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("translation.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <section className={`rounded-2xl border ${c.cardStatic} p-5 space-y-4`}>
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-primary" />
            <h2 className="font-semibold">{t("translation.newProject")}</h2>
          </div>
          <div className="space-y-3">
            <input
              type="file"
              accept=".txt,.md,.markdown,.pdf,.epub,text/plain,text/markdown,application/pdf,application/epub+zip"
              onChange={(event) => {
                const next = event.currentTarget.files?.[0] ?? null;
                setFile(next);
                setUploaded(null);
                if (next && !title.trim()) setTitle(next.name.replace(/\.[^.]+$/u, ""));
              }}
              className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground"
            />
            {file && (
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                {file.name} · {formatFileSize(file.size)}
              </div>
            )}
            <button
              onClick={uploadFile}
              disabled={!file || busy === "upload"}
              className={`w-full rounded-lg px-4 py-2 text-sm font-semibold ${c.btnSecondary} disabled:opacity-40`}
            >
              {busy === "upload" ? <Loader2 size={14} className="inline animate-spin mr-2" /> : null}
              {t("translation.upload")}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("translation.source")}
              <input value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)} className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm normal-case text-foreground" />
            </label>
            <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("translation.target")}
              <input value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm normal-case text-foreground" />
            </label>
          </div>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
            {t("translation.projectTitle")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm normal-case text-foreground" />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground block">
            {t("translation.segmentMax")}
            <input type="number" min={400} max={4000} value={segmentMaxChars} onChange={(e) => setSegmentMaxChars(Number(e.target.value) || 1200)} className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm normal-case text-foreground" />
          </label>
          <button
            onClick={createProject}
            disabled={!uploaded || busy === "create"}
            className={`w-full rounded-lg px-4 py-2 text-sm font-bold ${c.btnPrimary} disabled:opacity-40`}
          >
            {busy === "create" ? <Loader2 size={14} className="inline animate-spin mr-2" /> : null}
            {t("translation.create")}
          </button>
        </section>

        <section className={`rounded-2xl border ${c.cardStatic} p-5 space-y-5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              <h2 className="font-semibold">{t("translation.projects")}</h2>
            </div>
            <button onClick={() => refetch()} className={`rounded-lg px-3 py-1.5 text-xs ${c.btnSecondary}`}>{t("translation.refresh")}</button>
          </div>

          {loading && <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {!loading && translations.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("translation.empty")}
            </div>
          )}
          {translations.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {translations.map((item) => (
                <button
                  key={item.projectId}
                  onClick={() => setSelectedId(item.projectId)}
                  className={`rounded-xl border p-4 text-left transition-colors ${selected?.projectId === item.projectId ? "border-primary bg-primary/10" : "border-border bg-secondary/20 hover:bg-secondary/40"}`}
                >
                  <div className="font-semibold line-clamp-1">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.sourceLanguage} → {item.targetLanguage} · {item.chapters} {t("translation.chapters")}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground/70">{item.projectId}</div>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="rounded-2xl border border-border bg-background/40 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{selected.title}</div>
                  <div className="text-xs text-muted-foreground">{selected.projectId}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={runProject} disabled={busy === "run"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${c.btnPrimary} disabled:opacity-40`}>
                    {busy === "run" ? <Loader2 size={14} className="inline animate-spin mr-2" /> : <Play size={14} className="inline mr-2" />}
                    {t("translation.run")}
                  </button>
                  {(["md", "txt", "epub"] as const).map((format) => (
                    <button key={format} onClick={() => exportProject(format)} disabled={busy === "export"} className={`rounded-lg px-3 py-2 text-sm ${c.btnSecondary} disabled:opacity-40`}>
                      <Download size={14} className="inline mr-2" />
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {detailLoading && <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
              {detail?.manifest && (
                <div className="grid gap-2 md:grid-cols-2">
                  {detail.manifest.chapters.map((chapter) => (
                    <div key={chapter.chapterId} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                      <div className="font-medium">{chapter.title}</div>
                      <div className="text-xs text-muted-foreground">{chapter.status}</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("translation.report")}</div>
                <pre className="max-h-80 overflow-auto rounded-xl bg-secondary/30 p-4 text-xs leading-6 whitespace-pre-wrap">
                  {detail?.report?.trim() || t("translation.noReport")}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>

      {status && (
        <div className={`rounded-xl px-4 py-3 text-sm ${status.startsWith("Error:") ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
          {status}
        </div>
      )}
    </div>
  );
}
