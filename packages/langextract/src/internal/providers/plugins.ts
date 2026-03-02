import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import type {
  LoadedProviderPlugin,
  ProviderPluginLoadFailure,
  ProviderPluginLoadResult,
  ProviderPluginRegistration,
} from "./types.js";
import type { ProviderRegistry } from "./registry.js";

interface LoadProviderPluginsOptions {
  cwd?: string;
  packageJsonPath?: string;
  registry: ProviderRegistry;
  includeDevDependencies?: boolean;
}

interface PackageMetadata {
  name?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  langextract?: {
    providerPlugin?: string;
  };
}

export async function registerProviderPlugin(
  plugin: ProviderPluginRegistration,
  registry: ProviderRegistry,
): Promise<string> {
  if (typeof plugin === "function") {
    await plugin(registry);
    return plugin.name || "anonymous";
  }

  await plugin.register(registry);
  return plugin.name ?? "anonymous";
}

export async function loadProviderPlugins(
  options: LoadProviderPluginsOptions,
): Promise<ProviderPluginLoadResult> {
  const cwd = options.cwd ?? process.cwd();
  const packageJsonPath = options.packageJsonPath ?? path.join(cwd, "package.json");
  const includeDevDependencies = options.includeDevDependencies ?? true;

  const rootPackageJson = await readPackageJson(packageJsonPath);
  const packageNames = collectPackageNames(rootPackageJson, includeDevDependencies);
  const resolver = createRequire(packageJsonPath);

  const loaded: LoadedProviderPlugin[] = [];
  const failed: ProviderPluginLoadFailure[] = [];

  for (const packageName of packageNames) {
    const result = await tryLoadProviderPluginFromPackage(packageName, resolver, options.registry);
    if (result === null) {
      continue;
    }

    if ("failure" in result) {
      failed.push(result.failure);
      continue;
    }

    loaded.push(result.loaded);
  }

  return {
    loaded,
    failed,
  };
}

async function tryLoadProviderPluginFromPackage(
  packageName: string,
  resolver: NodeJS.Require,
  registry: ProviderRegistry,
): Promise<{ loaded: LoadedProviderPlugin } | { failure: ProviderPluginLoadFailure } | null> {
  try {
    const dependencyPackageJsonPath = resolver.resolve(`${packageName}/package.json`);
    const dependencyPackageJson = await readPackageJson(dependencyPackageJsonPath);
    const pluginEntry = dependencyPackageJson.langextract?.providerPlugin;
    if (typeof pluginEntry !== "string" || pluginEntry.trim().length === 0) {
      return null;
    }

    const pluginPath = path.resolve(path.dirname(dependencyPackageJsonPath), pluginEntry);
    const pluginModule = await import(pathToFileURL(pluginPath).href);
    const registration = pickPluginRegistration(pluginModule);
    if (registration === null) {
      return {
        failure: {
          packageName,
          reason:
            "Plugin module must export a function or an object with a register(registry) method.",
        },
      };
    }

    const pluginName = await registerProviderPlugin(registration, registry);
    return {
      loaded: {
        packageName,
        pluginName,
        entryPath: pluginPath,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      failure: {
        packageName,
        reason: message,
      },
    };
  }
}

function collectPackageNames(
  rootPackageJson: PackageMetadata,
  includeDevDependencies: boolean,
): string[] {
  const packageNames = new Set<string>();
  collectDependencyKeys(rootPackageJson.dependencies, packageNames);
  collectDependencyKeys(rootPackageJson.optionalDependencies, packageNames);
  collectDependencyKeys(rootPackageJson.peerDependencies, packageNames);

  if (includeDevDependencies) {
    collectDependencyKeys(rootPackageJson.devDependencies, packageNames);
  }

  return Array.from(packageNames).sort((a, b) => a.localeCompare(b));
}

function collectDependencyKeys(
  source: Record<string, string> | undefined,
  destination: Set<string>,
): void {
  if (source === undefined) {
    return;
  }

  for (const key of Object.keys(source)) {
    destination.add(key);
  }
}

function pickPluginRegistration(moduleValue: unknown): ProviderPluginRegistration | null {
  if (isProviderPlugin(moduleValue)) {
    return moduleValue;
  }

  if (!isRecord(moduleValue)) {
    return null;
  }

  const named = moduleValue.providerPlugin;
  if (isProviderPlugin(named)) {
    return named;
  }

  const defaultExport = moduleValue.default;
  if (isProviderPlugin(defaultExport)) {
    return defaultExport;
  }

  return null;
}

function isProviderPlugin(value: unknown): value is ProviderPluginRegistration {
  if (typeof value === "function") {
    return true;
  }

  return isRecord(value) && typeof value.register === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readPackageJson(filePath: string): Promise<PackageMetadata> {
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid package JSON: ${filePath}`);
  }

  return parsed as PackageMetadata;
}
