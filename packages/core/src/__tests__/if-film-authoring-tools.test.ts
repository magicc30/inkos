import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSetWorldAnchorTool, createAddVariableTool } from "../agent/film-authoring-tools.js";
import { loadStoryGraph } from "../interactive-film/graph-store.js";

describe("direct-write authoring tools", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "if-tools-")); await mkdir(join(root, "interactive-films", "p"), { recursive: true }); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("set_world_anchor applies a delta and persists worldAnchor", async () => {
    const tool = createSetWorldAnchorTool(root, "p");
    const res = await tool.execute("call-1", { storyCore: "查账复仇", theme: "信任" } as never);
    expect((res.content[0] as { type: "text"; text: string }).text).toMatch(/world|锚点|updated|rev/i);
    expect((await loadStoryGraph(root, "p"))?.worldAnchor?.storyCore).toBe("查账复仇");
  });

  it("add_variable applies a delta and persists the variable", async () => {
    const tool = createAddVariableTool(root, "p");
    await tool.execute("call-2", { name: "trust", type: "counter", default: 0, desc: "信任" } as never);
    expect((await loadStoryGraph(root, "p"))?.variables.map(v => v.name)).toContain("trust");
  });
});
