import { Command } from "commander";
import { PipelineRunner, StateManager } from "@actalk/inkos-core";
import { loadConfig, buildPipelineConfig, findProjectRoot, getLegacyMigrationHint, resolveBookId, log, logError } from "../utils.js";
import {
  formatAutoWriteAlreadyComplete,
  formatAutoWriteStart,
  formatWriteNextComplete,
  formatWriteNextProgress,
  formatWriteNextResultLines,
  resolveCliLanguage,
} from "../localization.js";

export const autoCommand = new Command("auto")
  .description("Auto-write chapters until the book reaches a target chapter number: auto [book-id] <target-chapter>")
  .argument("<args...>", "Book ID (optional, auto-detected if only one book) and target chapter number")
  .option("--words <n>", "Words per chapter (overrides book config)")
  .option("--json", "Output JSON")
  .option("-q, --quiet", "Suppress console output")
  .action(async (args: ReadonlyArray<string>, opts) => {
    try {
      const root = findProjectRoot();

      let bookId: string;
      let targetChapter: number;
      if (args.length === 1) {
        targetChapter = parseInt(args[0]!, 10);
        if (isNaN(targetChapter)) throw new Error(`Expected target chapter number, got "${args[0]}"`);
        bookId = await resolveBookId(undefined, root);
      } else if (args.length === 2) {
        targetChapter = parseInt(args[1]!, 10);
        if (isNaN(targetChapter)) throw new Error(`Expected target chapter number, got "${args[1]}"`);
        bookId = await resolveBookId(args[0], root);
      } else {
        throw new Error("Usage: inkos auto [book-id] <target-chapter>");
      }
      if (targetChapter < 1) {
        throw new Error(`Target chapter must be >= 1, got ${targetChapter}`);
      }

      const state = new StateManager(root);
      const book = await state.loadBookConfig(bookId);
      const language = resolveCliLanguage(book.language);
      const migrationHint = await getLegacyMigrationHint(root, bookId);
      if (migrationHint && !opts.json) {
        log(`[migration] ${migrationHint}`);
      }

      const startChapter = await state.getNextChapterNumber(bookId);
      if (startChapter > targetChapter) {
        if (opts.json) {
          log(JSON.stringify([], null, 2));
        } else {
          log(formatAutoWriteAlreadyComplete(language, bookId, startChapter - 1, targetChapter));
        }
        return;
      }

      const config = await loadConfig();
      // `inkos auto` is unattended batch writing, so the audit→revise loop must
      // run inline: force "auto" regardless of book/project reviewMode settings.
      const pipeline = new PipelineRunner(buildPipelineConfig(config, root, {
        quiet: opts.quiet,
        chapterReviewMode: "auto",
      }));

      if (!opts.json) log(formatAutoWriteStart(language, bookId, startChapter, targetChapter));

      const wordCount = opts.words ? parseInt(opts.words, 10) : undefined;

      const results = [];
      for (let chapter = startChapter; chapter <= targetChapter; chapter++) {
        if (!opts.json) log(formatWriteNextProgress(language, chapter, targetChapter, bookId));

        let result;
        try {
          result = await pipeline.writeNextChapter(bookId, wordCount);
        } catch (e) {
          throw new Error(
            `Chapter ${chapter} failed, stopping auto-write (${results.length} chapter(s) completed this run): ${e instanceof Error ? e.message : String(e)}`,
            { cause: e },
          );
        }
        results.push(result);

        if (!opts.json) {
          for (const line of formatWriteNextResultLines(language, {
            chapterNumber: result.chapterNumber,
            title: result.title,
            wordCount: result.wordCount,
            auditPassed: result.auditResult.passed,
            revised: result.revised,
            status: result.status,
            issues: result.auditResult.issues,
          })) {
            log(line);
          }
          log("");
        }

        if (result.status === "state-degraded") {
          throw new Error(
            `Chapter ${result.chapterNumber} finished in state-degraded status, stopping auto-write. Run "inkos write repair-state ${bookId} ${result.chapterNumber}" first, then re-run inkos auto.`,
          );
        }
      }

      if (opts.json) {
        log(JSON.stringify(results, null, 2));
      } else {
        log(formatWriteNextComplete(language));
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(`Auto-write failed: ${e}`);
      }
      process.exit(1);
    }
  });
