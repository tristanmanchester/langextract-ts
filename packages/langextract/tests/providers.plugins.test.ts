import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { MockLanguageModelV3 } from "ai/test";

import {
  loadProviderPlugins,
  ProviderRegistry,
  registerProviderPlugin,
  type ProviderDefinition,
} from "../src/internal/providers/index.js";

interface WorkspacePackage {
  name: string;
  section?: "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";
  packageJson: Record<string, unknown>;
  files?: Record<string, string>;
}

function createStaticProvider(id: string): ProviderDefinition {
  return {
    id,
    defaultModelId: `${id}-default`,
    provider: {
      languageModel(modelId: string) {
        return new MockLanguageModelV3({
          provider: id,
          modelId,
          doGenerate: {
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            content: [{ type: "text", text: `provider:${id}:${modelId}` }],
            warnings: [],
            request: {},
            response: {
              id: `response-${id}-${modelId}`,
              modelId,
              timestamp: new Date(0),
            },
          },
        });
      },
      embeddingModel() {
        throw new Error("Not implemented in test provider");
      },
      imageModel() {
        throw new Error("Not implemented in test provider");
      },
      rerankingModel() {
        throw new Error("Not implemented in test provider");
      },
    },
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function createWorkspace(packages: WorkspacePackage[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "langextract-provider-plugins-"));
  const nodeModulesPath = path.join(root, "node_modules");

  await mkdir(nodeModulesPath, { recursive: true });

  const rootPackageJson: Record<string, unknown> = {
    name: "plugin-workspace",
    private: true,
  };

  for (const pkg of packages) {
    const section = pkg.section ?? "dependencies";
    const sectionValue = (rootPackageJson[section] ?? {}) as Record<string, string>;
    sectionValue[pkg.name] = "1.0.0";
    rootPackageJson[section] = sectionValue;

    const packageRoot = path.join(nodeModulesPath, pkg.name);
    await mkdir(packageRoot, { recursive: true });
    await writeJson(path.join(packageRoot, "package.json"), pkg.packageJson);

    for (const [relativePath, content] of Object.entries(pkg.files ?? {})) {
      await writeFile(path.join(packageRoot, relativePath), content, "utf8");
    }
  }

  await writeJson(path.join(root, "package.json"), rootPackageJson);
  return root;
}

void test("registerProviderPlugin supports function and object registrations", async () => {
  const registry = new ProviderRegistry("test");

  async function functionPlugin(target: ProviderRegistry): Promise<void> {
    target.registerProvider(createStaticProvider("function-provider"));
  }

  const functionName = await registerProviderPlugin(functionPlugin, registry);
  assert.equal(functionName, "functionPlugin");

  const objectName = await registerProviderPlugin(
    {
      register(target) {
        target.registerProvider(createStaticProvider("object-provider"));
      },
    },
    registry,
  );

  assert.equal(objectName, "anonymous");
  assert.equal(registry.hasProvider("function-provider"), true);
  assert.equal(registry.hasProvider("object-provider"), true);
});

void test("loadProviderPlugins loads named and default plugin exports", async () => {
  const workspace = await createWorkspace([
    {
      name: "named-plugin",
      packageJson: {
        name: "named-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      files: {
        "plugin.mjs": [
          "export const providerPlugin = {",
          "  name: 'named-plugin-entry',",
          "  register(registry) {",
          "    registry.registerProvider({",
          "      id: 'named-provider',",
          "      defaultModelId: 'named-default',",
          "      provider: {",
          "        languageModel() { throw new Error('unused'); },",
          "        embeddingModel() { throw new Error('unused'); },",
          "        imageModel() { throw new Error('unused'); },",
          "        rerankingModel() { throw new Error('unused'); }",
          "      }",
          "    });",
          "  }",
          "};",
          "",
        ].join("\n"),
      },
    },
    {
      name: "default-plugin",
      packageJson: {
        name: "default-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      files: {
        "plugin.mjs": [
          "export default function defaultPlugin(registry) {",
          "  registry.registerProvider({",
          "    id: 'default-provider',",
          "    defaultModelId: 'default-model',",
          "    provider: {",
          "      languageModel() { throw new Error('unused'); },",
          "      embeddingModel() { throw new Error('unused'); },",
          "      imageModel() { throw new Error('unused'); },",
          "      rerankingModel() { throw new Error('unused'); }",
          "    }",
          "  });",
          "}",
          "",
        ].join("\n"),
      },
    },
    {
      name: "plain-package",
      packageJson: {
        name: "plain-package",
        version: "1.0.0",
        type: "module",
      },
      files: {
        "index.mjs": "export const value = 1;\n",
      },
    },
  ]);

  const registry = new ProviderRegistry("gateway");
  const result = await loadProviderPlugins({ cwd: workspace, registry });

  assert.equal(result.failed.length, 0);
  assert.deepEqual(
    result.loaded.map((entry) => entry.packageName).sort((a, b) => a.localeCompare(b)),
    ["default-plugin", "named-plugin"],
  );
  assert.equal(registry.hasProvider("named-provider"), true);
  assert.equal(registry.hasProvider("default-provider"), true);
});

void test("loadProviderPlugins excludes devDependencies when includeDevDependencies=false", async () => {
  const workspace = await createWorkspace([
    {
      name: "prod-plugin",
      section: "dependencies",
      packageJson: {
        name: "prod-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      files: {
        "plugin.mjs": [
          "export const providerPlugin = {",
          "  register(registry) {",
          "    registry.registerProvider({",
          "      id: 'prod-provider',",
          "      defaultModelId: 'prod-model',",
          "      provider: {",
          "        languageModel() { throw new Error('unused'); },",
          "        embeddingModel() { throw new Error('unused'); },",
          "        imageModel() { throw new Error('unused'); },",
          "        rerankingModel() { throw new Error('unused'); }",
          "      }",
          "    });",
          "  }",
          "};",
          "",
        ].join("\n"),
      },
    },
    {
      name: "dev-plugin",
      section: "devDependencies",
      packageJson: {
        name: "dev-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      files: {
        "plugin.mjs": [
          "export const providerPlugin = {",
          "  register(registry) {",
          "    registry.registerProvider({",
          "      id: 'dev-provider',",
          "      defaultModelId: 'dev-model',",
          "      provider: {",
          "        languageModel() { throw new Error('unused'); },",
          "        embeddingModel() { throw new Error('unused'); },",
          "        imageModel() { throw new Error('unused'); },",
          "        rerankingModel() { throw new Error('unused'); }",
          "      }",
          "    });",
          "  }",
          "};",
          "",
        ].join("\n"),
      },
    },
  ]);

  const registry = new ProviderRegistry("gateway");
  const result = await loadProviderPlugins({
    cwd: workspace,
    registry,
    includeDevDependencies: false,
  });

  assert.deepEqual(
    result.loaded.map((entry) => entry.packageName),
    ["prod-plugin"],
  );
  assert.equal(registry.hasProvider("prod-provider"), true);
  assert.equal(registry.hasProvider("dev-provider"), false);
});

void test("loadProviderPlugins reports failures for invalid plugin exports", async () => {
  const workspace = await createWorkspace([
    {
      name: "bad-plugin",
      packageJson: {
        name: "bad-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      files: {
        "plugin.mjs": "export const notAPlugin = 42;\n",
      },
    },
  ]);

  const registry = new ProviderRegistry("gateway");
  const result = await loadProviderPlugins({ cwd: workspace, registry });

  assert.equal(result.loaded.length, 0);
  assert.equal(result.failed.length, 1);
  const firstFailure = result.failed[0];
  assert.ok(firstFailure !== undefined);
  assert.equal(firstFailure.packageName, "bad-plugin");
  assert.match(firstFailure.reason, /must export a function or an object/i);
});

void test("loadProviderPlugins captures plugin registration exceptions", async () => {
  const workspace = await createWorkspace([
    {
      name: "throwing-plugin",
      packageJson: {
        name: "throwing-plugin",
        version: "1.0.0",
        type: "module",
        langextract: {
          providerPlugin: "./plugin.mjs",
        },
      },
      files: {
        "plugin.mjs": [
          "export const providerPlugin = {",
          "  register() {",
          "    throw new Error('plugin boom');",
          "  }",
          "};",
          "",
        ].join("\n"),
      },
    },
  ]);

  const registry = new ProviderRegistry("gateway");
  const result = await loadProviderPlugins({ cwd: workspace, registry });

  assert.equal(result.loaded.length, 0);
  assert.equal(result.failed.length, 1);
  const firstFailure = result.failed[0];
  assert.ok(firstFailure !== undefined);
  assert.equal(firstFailure.packageName, "throwing-plugin");
  assert.match(firstFailure.reason, /plugin boom/i);
});

void test("loadProviderPlugins reports missing dependency packages as failures", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "langextract-provider-plugins-missing-"));
  await writeJson(path.join(workspace, "package.json"), {
    name: "missing-workspace",
    private: true,
    dependencies: {
      "missing-plugin": "1.0.0",
    },
  });

  const registry = new ProviderRegistry("gateway");
  const result = await loadProviderPlugins({ cwd: workspace, registry });

  assert.equal(result.loaded.length, 0);
  assert.equal(result.failed.length, 1);
  const firstFailure = result.failed[0];
  assert.ok(firstFailure !== undefined);
  assert.equal(firstFailure.packageName, "missing-plugin");
  assert.match(firstFailure.reason, /Cannot find module|Could not resolve/i);
});
