import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EnvironmentConfigurationError,
  getSelectedAiConfiguration,
  getServerEnv,
  loadRootEnv
} from "./index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function base(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { DATABASE_URL: "postgresql://local/test", AI_PROVIDER: "gemini", ...overrides };
}

describe("selected AI provider configuration", () => {
  it("requires Gemini configuration but not Groq when Gemini is selected", () => {
    const env = getServerEnv(base({ GEMINI_API_KEY: "gemini-key", GEMINI_MODEL: "gemini-model" }));
    expect(getSelectedAiConfiguration(env)).toEqual({ provider: "gemini", apiKey: "gemini-key", model: "gemini-model" });
    expect(() => getSelectedAiConfiguration(getServerEnv(base()))).toThrow(/GEMINI_API_KEY and GEMINI_MODEL/);
  });

  it("requires Groq configuration but not Gemini when Groq is selected", () => {
    const env = getServerEnv(base({ AI_PROVIDER: "groq", GROQ_API_KEY: "groq-key", GROQ_MODEL: "groq-model" }));
    expect(getSelectedAiConfiguration(env)).toEqual({ provider: "groq", apiKey: "groq-key", model: "groq-model" });
    expect(() => getSelectedAiConfiguration(getServerEnv(base({ AI_PROVIDER: "groq" })))).toThrow(/GROQ_API_KEY and GROQ_MODEL/);
  });

  it("rejects unsupported providers without including secret values", () => {
    const secret = "must-not-appear";
    let thrown: unknown;
    try {
      getServerEnv(base({ AI_PROVIDER: "unsupported", GEMINI_API_KEY: secret }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EnvironmentConfigurationError);
    expect((thrown as Error).message).not.toContain(secret);
  });
});

describe("root environment loading", () => {
  it("loads the repository-root .env without overwriting process-supplied values", () => {
    const root = mkdtempSync(join(tmpdir(), "zepto-env-"));
    temporaryDirectories.push(root);
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    writeFileSync(join(root, ".env"), "DATABASE_URL=from-file\nAI_PROVIDER=gemini\nGEMINI_MODEL=from-file\n");
    const target: NodeJS.ProcessEnv = { DATABASE_URL: "from-process" };

    expect(loadRootEnv({ startDirectory: join(root, "packages"), target }).loaded).toBe(true);
    expect(target.DATABASE_URL).toBe("from-process");
    expect(target.AI_PROVIDER).toBe("gemini");
    expect(target.GEMINI_MODEL).toBe("from-file");
  });
});
