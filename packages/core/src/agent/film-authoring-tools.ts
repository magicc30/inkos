import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { applyGraphDelta } from "../interactive-film/authoring-store.js";
import {
  buildWorldAnchorDelta,
  buildAddVariableDelta,
  buildDefineEndingDelta,
  buildUpsertCharactersDelta,
} from "../interactive-film/authoring-tools.js";
import { writeCharacterFacts } from "../interactive-film/memory-link.js";
import { MemoryDB } from "../state/memory-db.js";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Local helper — textResult is not exported from agent-tools.ts
// ---------------------------------------------------------------------------

function textResult(text: string): AgentToolResult<undefined>;
function textResult<T>(text: string, details: T): AgentToolResult<T>;
function textResult<T = undefined>(text: string, details?: T): AgentToolResult<T> {
  return { content: [{ type: "text", text }], details: details as T };
}

// ---------------------------------------------------------------------------
// set_world_anchor
// ---------------------------------------------------------------------------

const WorldAnchorParams = Type.Object({
  storyCore: Type.Optional(Type.String({ description: "故事核心一句话" })),
  theme: Type.Optional(Type.String({ description: "主题" })),
  genre: Type.Optional(Type.String({ description: "题材" })),
  worldRules: Type.Optional(Type.String({ description: "世界规则" })),
  durationMinutes: Type.Optional(Type.Number({ description: "目标时长（分钟）" })),
});

export function createSetWorldAnchorTool(projectRoot: string, projectId: string): AgentTool<typeof WorldAnchorParams> {
  return {
    name: "set_world_anchor",
    description: "interactive-film authoring: set/update the world anchor (story core, theme, rules, duration). Applies immediately.",
    label: "Set World Anchor",
    parameters: WorldAnchorParams,
    async execute(_id, params: Static<typeof WorldAnchorParams>) {
      const { graph, rev } = await applyGraphDelta({ projectRoot, projectId, delta: buildWorldAnchorDelta(params), phase: "world" });
      return textResult(`World anchor updated (rev ${rev}). core=${graph.worldAnchor?.storyCore ?? ""}`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// add_variable
// ---------------------------------------------------------------------------

const AddVariableParams = Type.Object({
  name: Type.String({ description: "variable name (unique key)" }),
  type: Type.Union([Type.Literal("flag"), Type.Literal("counter"), Type.Literal("relationship"), Type.Literal("item")]),
  default: Type.Union([Type.Number(), Type.String(), Type.Boolean()], { description: "default value" }),
  desc: Type.Optional(Type.String({ description: "what it tracks" })),
});

export function createAddVariableTool(projectRoot: string, projectId: string): AgentTool<typeof AddVariableParams> {
  return {
    name: "add_variable",
    description: "interactive-film authoring: add/update a variable. Applies immediately.",
    label: "Add Variable",
    parameters: AddVariableParams,
    async execute(_id, params: Static<typeof AddVariableParams>) {
      const { rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: buildAddVariableDelta({ name: params.name, type: params.type, default: params.default, desc: params.desc ?? "" }),
      });
      return textResult(`Variable "${params.name}" added (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// define_ending
// ---------------------------------------------------------------------------

const DefineEndingParams = Type.Object({
  id: Type.String({ description: "ending id" }),
  nodeId: Type.String({ description: "the ending node this describes (must exist)" }),
  title: Type.String(),
  type: Type.Union([Type.Literal("good"), Type.Literal("bad"), Type.Literal("neutral"), Type.Literal("secret")]),
  description: Type.Optional(Type.String()),
});

export function createDefineEndingTool(projectRoot: string, projectId: string): AgentTool<typeof DefineEndingParams> {
  return {
    name: "define_ending",
    description: "interactive-film authoring: define/update an ending (its nodeId must exist). Applies immediately.",
    label: "Define Ending",
    parameters: DefineEndingParams,
    async execute(_id, params: Static<typeof DefineEndingParams>) {
      const { rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: buildDefineEndingDelta({ id: params.id, nodeId: params.nodeId, title: params.title, type: params.type, description: params.description ?? "" }),
      });
      return textResult(`Ending "${params.title}" defined (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// upsert_characters
// ---------------------------------------------------------------------------

const UpsertCharactersParams = Type.Object({
  characters: Type.Array(Type.Object({
    id: Type.String(),
    name: Type.String(),
    role: Type.Optional(Type.Union([Type.Literal("protagonist"), Type.Literal("antagonist"), Type.Literal("support"), Type.Literal("other")])),
    motivation: Type.Optional(Type.String()),
    voiceProfile: Type.Optional(Type.Object({
      speakingRhythm: Type.Optional(Type.String()),
      vocabulary: Type.Optional(Type.String()),
      sampleLines: Type.Optional(Type.Array(Type.String())),
    })),
  })),
});

export function createUpsertCharactersTool(projectRoot: string, projectId: string): AgentTool<typeof UpsertCharactersParams> {
  return {
    name: "upsert_characters",
    description: "interactive-film authoring: add/update characters with voice profiles. Applies immediately and records them to memory for cross-node voice consistency.",
    label: "Upsert Characters",
    parameters: UpsertCharactersParams,
    async execute(_id, params: Static<typeof UpsertCharactersParams>) {
      const chars = params.characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role ?? "other" as const,
        motivation: c.motivation ?? "",
        voiceProfile: c.voiceProfile
          ? {
              speakingRhythm: c.voiceProfile.speakingRhythm ?? "",
              vocabulary: c.voiceProfile.vocabulary ?? "",
              sampleLines: c.voiceProfile.sampleLines ?? [],
            }
          : undefined,
      }));
      const { rev } = await applyGraphDelta({ projectRoot, projectId, delta: buildUpsertCharactersDelta(chars) });
      const db = new MemoryDB(join(projectRoot, "interactive-films", projectId));
      try {
        writeCharacterFacts(db, chars, rev);
      } finally {
        db.close();
      }
      return textResult(`Upserted ${chars.length} character(s) (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}
