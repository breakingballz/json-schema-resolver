import { dirname, join, normalize } from "path";

type RefType = "web" | "filesystem";

interface RefBase {
  filepath?: string;
  hash?: string;
  isRoot?: boolean;
  type: RefType;
}

interface RefNonRoot extends RefBase {
  filepath?: string;
  isRoot: false;
}

export interface RefRoot extends RefBase {
  filepath: string;
  isRoot: true;
}

export type Ref = RefRoot | RefNonRoot;

export function stringifyRef(ref: Ref): string {
  return `${ref.filepath ?? ""}${ref.hash ? `#/${ref.hash}` : ""}`;
}

export function parseRef(ref: string): Ref {
  if (ref.match(/^https?:\/\//i)) {
    const url = new URL(ref);

    return {
      filepath: `${url.origin}${normalize(url.pathname).replaceAll("\\", "/")}`,
      hash: url.hash.length ? url.hash.replace("#/", "") : undefined,
      type: "web",
      isRoot: true,
    };
  }

  const [parts, hash] = ref.split("#/");
  const filepath = parts?.length ? normalize(parts).replaceAll("\\", "/") : undefined;

  return {
    filepath,
    hash,
    type: "filesystem",
    isRoot: Boolean(filepath?.match(/^.+?:\/.+/)),
  } as Ref;
}

export function combineRefs(refA: string | Ref, refB: string | Ref): Ref {
  const parsedA = typeof refA === "string" ? parseRef(refA) : refA;
  const parsedB = typeof refB === "string" ? parseRef(refB) : refB;

  if (parsedB.isRoot) {
    return parsedB;
  }

  if (!parsedA.isRoot) {
    throw new Error("Reference A is not a root");
  }

  if (parsedA.type === "web") {
    const url = new URL(parsedA.filepath);

    return {
      filepath: `${url.origin}${normalize(
        parsedB.filepath ? join(dirname(url.pathname), parsedB.filepath) : url.pathname,
      ).replaceAll("\\", "/")}`,
      hash: parsedB.hash,
      type: "web",
      isRoot: true,
    };
  }

  return {
    filepath: normalize(
      parsedB.filepath ? join(dirname(parsedA.filepath), parsedB.filepath) : parsedA.filepath,
    ).replaceAll("\\", "/"),
    isRoot: true,
    type: "filesystem",
    hash: parsedB.hash,
  };
}
