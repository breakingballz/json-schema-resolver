import fs from "fs/promises";
import { combineRefs, parseRef, type RefRoot, stringifyRef, type Ref } from "./ref";
import { getRandomName } from "./utils";
import yaml from "js-yaml";

type Resolved = Record<string, Promise<Record<string, unknown>>>;

type Mapping = Record<string, string>;

export function putMappingEntry(entry: string, mapping: Mapping): string {
  mapping[entry] = mapping[entry] ?? getRandomName();

  return mapping[entry];
}

function parseContent(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch {
    // noop
  }

  try {
    return yaml.load(content, { json: true }) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse content");
  }
}

export async function resolveWebRef(ref: RefRoot): Promise<Record<string, unknown>> {
  let content: string;

  try {
    content = await (await fetch(ref.filepath)).text();
  } catch {
    throw new Error("Failed to fetch schema from web");
  }

  return parseContent(content);
}

export async function resolveFilesystemRef(ref: RefRoot): Promise<Record<string, unknown>> {
  let content: string;

  try {
    content = await fs.readFile(ref.filepath, "utf-8");
  } catch {
    throw new Error("Failed to fetch schema from filesystem");
  }

  return parseContent(content);
}

export async function resolveInnerRefs(
  ref: Ref,
  current: unknown,
  resolved: Resolved,
  mapping: Mapping,
): Promise<void> {
  if (typeof current !== "object" || current === null) {
    return;
  }

  if (current instanceof Array) {
    await Promise.all(current.map((inner) => resolveInnerRefs(ref, inner, resolved, mapping)));

    return;
  }

  if ("$ref" in current && typeof current.$ref === "string") {
    const nextRef = combineRefs(ref, current.$ref) as RefRoot;
    const name = putMappingEntry(nextRef.filepath, mapping);

    current.$ref = stringifyRef({ ...nextRef, filepath: name });

    await resolveRefAux(nextRef, resolved, mapping);

    return;
  }

  await Promise.all(
    Object.values(current).map((inner) => resolveInnerRefs(ref, inner, resolved, mapping)),
  );
}

export async function resolveRefAux(
  ref: Ref,
  resolved: Resolved,
  mapping: Mapping,
): Promise<Resolved> {
  if (!ref.isRoot) {
    throw new Error("Cannot resolve a non root");
  }

  const name = putMappingEntry(ref.filepath, mapping);

  if (name in resolved) {
    return resolved;
  }

  const resolvedRef = ref.type === "web" ? resolveWebRef(ref) : resolveFilesystemRef(ref);

  resolved[name] = resolvedRef;

  await resolveInnerRefs(ref, await resolvedRef, resolved, mapping);

  return resolved;
}

export async function resolveRef(
  ref: Ref | string,
): Promise<Record<string, Record<string, unknown>>> {
  const parsedRef = (typeof ref === "string" ? parseRef(ref) : ref) as RefRoot;
  const resolved = await resolveRefAux(parsedRef, {}, { [parsedRef.filepath]: "root" });

  const tasks = Object.entries(resolved).map(([filepath, task]) =>
    task.then((result) => [filepath, result]),
  );

  return Object.fromEntries(await Promise.all(tasks));
}
