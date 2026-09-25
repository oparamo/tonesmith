/**
 * Checks patch specs and dot-path edits against a device's own capability catalog, and applies the
 * edits. Every device presents its blocks in one shape (selectors beside a `params` bag) and
 * describes them in one catalog shape, so none of this is any device's knowledge: a driver hands
 * over its `capabilities`, adds the checks only it can make, and gets the rest from here.
 *
 * A spec arrives as plain data from a caller that need not know the device, so every problem it can
 * have is a data problem: a block that isn't on the device, a type the block doesn't offer, a
 * control the chosen type has no field for, a value of the wrong kind or out of range. Reporting
 * them together matters as much as catching them, since a caller fixing one rejection at a time
 * pays a round trip per mistake and the catalog can answer for all of them in one pass.
 */
import { findGroup, findType } from "./capabilityService";
import { ON_FIELD, PARAMS_FIELD, SELECTION_FIELDS, SUB_TYPE_FIELD, TYPE_FIELD } from "../common/blockField";
import type {
  CapabilityGroup, CapabilityType, ChainBlock, DeviceCapabilities, FieldEdit, FieldEdits, FieldValue,
  Patch, PatchDriver, ParamSpec,
} from "../model";

/** Every problem found with one block or one batch, empty when it is usable. */
type Issues = string[];

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// ── Resolving a selection against the catalog ─────────────────────────────────

/** A block's selection resolved against capabilities: its group, and the type its `type` names. */
interface Selection {
  capGroup: CapabilityGroup;
  /** Absent for a group with no types, where the group's shared params are the whole surface. */
  capType?: CapabilityType;
}

const groupOrUndefined = (caps: DeviceCapabilities, id: string): CapabilityGroup | undefined => {
  try {
    return findGroup(caps, id);
  } catch {
    return undefined;
  }
};

const typeOrUndefined = (group: CapabilityGroup, id: string): CapabilityType | undefined => {
  try {
    return findType(group, id);
  } catch {
    return undefined;
  }
};

/**
 * Resolves a block's group and type, or undefined for either miss. Tolerant of anything in `type`,
 * because its callers hold unvalidated input; a caller that needs the miss reported names the valid
 * ids itself rather than having this raise.
 */
const resolveSelection = (caps: DeviceCapabilities, group: string, type?: unknown): Selection | undefined => {
  const capGroup = groupOrUndefined(caps, group);
  if (capGroup === undefined) return undefined;
  if (capGroup.types.length === 0) return { capGroup };
  if (typeof type !== "string") return undefined;

  const capType = typeOrUndefined(capGroup, type);
  if (capType === undefined) return undefined;
  return { capGroup, capType };
};

/** Variant ids are matched case-insensitively, as group and type ids are. */
const matchesSubType = (candidate: CapabilityType, subType: string): boolean =>
  candidate.id.toUpperCase() === subType.toUpperCase();

/**
 * The ParamSpecs in effect for a selection: the group's shared params, the chosen type's params,
 * and, when a subType is given and carries its own, that subType's params (e.g. a delay
 * sub-algorithm).
 */
const specsForType = (selection: Selection, subType?: string): ParamSpec[] => {
  const { capGroup, capType } = selection;
  const specs = [...(capGroup.params ?? []), ...(capType?.params ?? [])];
  const matchedSubType = subType === undefined
    ? undefined
    : capType?.subTypes?.find(candidate => matchesSubType(candidate, subType));
  if (matchedSubType?.params) specs.push(...matchedSubType.params);
  return specs;
};

/** The block a spec or a path names, as the chain describes it; undefined for a name it doesn't list. */
const chainBlock = (caps: DeviceCapabilities, name: string): ChainBlock | undefined =>
  Object.hasOwn(caps.chain.blocks, name) ? caps.chain.blocks[name] : undefined;

// ── What a block accepts ──────────────────────────────────────────────────────

/** A block's selection as a rejection message finds it: read off input that already failed. */
interface Selected {
  group: string;
  type?: unknown;
  subType?: unknown;
}

/** What one type accepts: the params it takes, and the variants it offers, if any. */
interface TypeSurface {
  paramKeys: string[];
  subTypes: string[];
}

/**
 * The input surface of the chosen type, or undefined when nothing resolves it.
 *
 * Tolerant of anything in `type` and `subType`, because its callers hold unvalidated input: a
 * message deciding whether a rejected key was a real param in the wrong place, and one deciding
 * which fields are worth offering back. Not resolving is different from resolving to nothing, so
 * an unknown type is undefined here rather than an empty surface.
 */
const typeSurface = (caps: DeviceCapabilities, selected: Selected): TypeSurface | undefined => {
  const selection = resolveSelection(caps, selected.group, selected.type);
  if (selection === undefined) return undefined;

  const subType = asString(selected.subType);
  return {
    paramKeys: specsForType(selection, subType).flatMap(spec => (spec.key === undefined ? [] : [spec.key])),
    subTypes: (selection.capType?.subTypes ?? []).map(variant => variant.id),
  };
};

// ── Selector checks ───────────────────────────────────────────────────────────

/**
 * Where a variant selection belongs on a type that declares no subTypes. Some such types do have
 * a variant to pick, carried as an ordinary param the device labels TYPE, and naming that param's
 * key is what turns the rejection into a one-step fix rather than a dead end.
 */
const subTypeAlternative = (capType: CapabilityType): string => {
  const selector = capType.params?.find(param => param.name === "TYPE");
  if (selector?.key === undefined) return "it has no variants to choose between";
  return `set params.${selector.key} instead (${selector.range})`;
};

/** One block's subType alongside the capability type it was sent to. */
interface SubTypeCheck {
  group: string;
  type: string;
  capType: CapabilityType;
  subType: string;
}

/**
 * Rejects a subType the chosen type can't take, whether because it declares none or because this
 * isn't one of them. Either way the value would encode nowhere: the patch saves clean, plays as the
 * default, and nothing in the response says the selection was dropped. An unlisted variant is worse
 * than a missing one, since the codec's own rejection names only the value it couldn't look up.
 */
const subTypeIssues = (check: SubTypeCheck): Issues => {
  const { group, type, capType, subType } = check;
  const variants = capType.subTypes ?? [];
  if (variants.length === 0) {
    return [`${group} ${type} takes no subType (got "${subType}"): ${subTypeAlternative(capType)}`];
  }
  if (variants.some(candidate => matchesSubType(candidate, subType))) return [];
  const valid = variants.map(candidate => candidate.id).join(", ");
  return [`${group} ${type} has no subType "${subType}". Valid subTypes: ${valid}`];
};

const typeChoices = (capGroup: CapabilityGroup): string => capGroup.types.map(type => type.id).join(", ");

/** Names what the group does offer, since a rejected `type` leaves the caller with no next step. */
const unknownTypeIssue = (capGroup: CapabilityGroup, type: unknown): string =>
  `${capGroup.id} has no type ${JSON.stringify(type)}. Types: ${typeChoices(capGroup)}`;

/** The blocks a type is limited to, when the catalog limits it to some of its group's blocks. */
const onlyBlocksFor = (caps: DeviceCapabilities, name: string, type: string): string[] | undefined => {
  const group = chainBlock(caps, name)?.group;
  if (group === undefined) return undefined;
  return resolveSelection(caps, group, type)?.capType?.blocks;
};

/**
 * Rejects a type in a block the device does not offer it in. The blocks that do offer it are named
 * because moving the block there is the whole fix. Without this the type is accepted, and its
 * params are written over whatever the block it landed in keeps at those byte offsets.
 */
const typeBlockIssues = (caps: DeviceCapabilities, name: string, type: unknown): Issues => {
  if (typeof type !== "string") return [];
  const onlyBlocks = onlyBlocksFor(caps, name, type);
  if (onlyBlocks === undefined || onlyBlocks.includes(name)) return [];
  return [`${name} has no ${type}: this device offers it in ${onlyBlocks.join(", ")} only.`];
};

/** A block's shape selectors, as they arrive from a caller: unvalidated, and each one optional. */
interface Selectors {
  group: string;
  on?: unknown;
  subType?: unknown;
}

/**
 * `on` and `subType` pick a block's shape rather than set one of its controls, so they are filtered
 * out of the param check and would otherwise reach the builder on nothing but a cast.
 *
 * `null` is what a decoded block carries for a type with no variants, so it has to mean the same
 * thing here as leaving the field out. Rejecting it would make the block a caller just read back
 * un-resendable, which is the whole reason input and output share a shape.
 */
const selectorIssues = (selectors: Selectors): Issues => {
  const { group, on, subType } = selectors;
  const issues: Issues = [];
  if (on !== undefined && typeof on !== "boolean") {
    issues.push(`${group} on takes true or false (got ${JSON.stringify(on)})`);
  }
  if (subType !== undefined && subType !== null && typeof subType !== "string") {
    issues.push(`${group} subType takes the name of a variant (got ${JSON.stringify(subType)})`);
  }
  return issues;
};

// ── Value checks ──────────────────────────────────────────────────────────────

/** One param's value alongside the spec and selection it is checked against. */
interface ParamCheck {
  group: string;
  type?: string;
  spec: ParamSpec;
  value: unknown;
}

/** How a message names the param, dropping the type clause for a block that has no types. */
const paramLabel = (check: ParamCheck): string => {
  const named = `${check.group} ${check.spec.name}`;
  const label = check.type === undefined ? named : `${named} for ${check.type}`;
  return label;
};

/**
 * What kind of value a spec takes, in the words the rejection uses. Bounds say a param is numeric
 * but not whether a fraction is legal, which is what `decimals` settles.
 */
const expectedKind = (spec: ParamSpec): string => {
  if (spec.kind === "boolean") return "true or false";
  if (spec.kind === "discrete") return `one of: ${spec.values.join(", ")}`;
  if (spec.kind === "numericOrNamed") return `a whole number or one of: ${spec.values.join(", ")}`;
  const numeric = spec.decimals === undefined ? "a whole number" : "a number";
  return numeric;
};

/** True when the value is the kind this spec takes at all, before asking whether it is in range. */
const isRightKind = (spec: ParamSpec, value: unknown): boolean => {
  if (spec.kind === "boolean") return typeof value === "boolean";
  if (spec.kind === "discrete") return typeof value === "string";
  if (spec.kind === "numericOrNamed" && typeof value === "string") return true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const fractionsAllowed = spec.kind === "numeric" && spec.decimals !== undefined;
  return fractionsAllowed || Number.isInteger(value);
};

/** Bounds and value list read off whichever kinds carry them, so one check covers all four kinds. */
const domainIssue = (spec: ParamSpec, value: unknown): string | undefined => {
  const bounded = spec.kind === "numeric" || spec.kind === "numericOrNamed";
  if (bounded && typeof value === "number" && (value < spec.min || value > spec.max)) {
    return `must be ${spec.min}–${spec.max}`;
  }
  const named = spec.kind === "discrete" || spec.kind === "numericOrNamed";
  if (named && typeof value === "string" && !spec.values.includes(value)) {
    return `must be one of: ${spec.values.join(", ")}`;
  }
  return undefined;
};

/**
 * Checks one value against one spec: that it is the kind the param takes, then that it is in range
 * or a member of the value list. The kind check leads because a value of the wrong kind passes the
 * range check by falling through it, letting something like a string threshold reach the codec
 * unchecked.
 */
const valueIssues = (check: ParamCheck): Issues => {
  const { spec, value } = check;
  if (!isRightKind(spec, value)) {
    return [`${paramLabel(check)} takes ${expectedKind(spec)} (got ${JSON.stringify(value)})`];
  }
  const issue = domainIssue(spec, value);
  if (issue === undefined) return [];
  return [`${paramLabel(check)} ${issue} (got ${JSON.stringify(value)})`];
};

/** Params indexed by the key a spec writes them under, which is where a supplied value is matched. */
const specsByKey = (specs: readonly ParamSpec[]): Map<string, ParamSpec> =>
  new Map(specs.flatMap(spec => (spec.key === undefined ? [] : [[spec.key, spec] as const])));

/** A supplied value and the spec it is checked against. */
interface SpecifiedValue {
  spec: ParamSpec;
  value: unknown;
}

/** Each supplied value paired with its spec. A key with no spec is skipped; the key check reports it. */
const pairedWithSpecs = (byKey: Map<string, ParamSpec>, values: Record<string, unknown>): SpecifiedValue[] =>
  Object.entries(values)
    .map(([key, value]) => ({ spec: byKey.get(key), value }))
    .filter((pair): pair is SpecifiedValue => pair.spec !== undefined);

/** What the caller selected and supplied for one block. */
interface TypeParams {
  group: string;
  /** Absent for a block whose group offers no types to choose between. */
  type?: string;
  subType?: string;
  values: Record<string, unknown>;
}

/**
 * Validates one block's selection against the catalog: that its `subType` is a variant this type
 * actually has, and that every supplied param value fits the spec for the chosen type (numeric
 * params by their per-type `min`/`max`, discrete params by their `values` list). `values` is keyed
 * by each param's `key`. Keys with no matching spec are ignored here; the key check reports them.
 */
const validateTypeParams = (caps: DeviceCapabilities, params: TypeParams): Issues => {
  const { group, type, subType, values } = params;
  const selection = resolveSelection(caps, group, type);
  if (selection === undefined) return [];
  // A subType on a block with no types at all is an unrecognized key, already reported as one.
  const subTypeProblems = subType !== undefined && type !== undefined && selection.capType !== undefined
    ? subTypeIssues({ group, type, capType: selection.capType, subType })
    : [];

  const paired = pairedWithSpecs(specsByKey(specsForType(selection, subType)), values);
  return [...subTypeProblems, ...paired.flatMap(pair => valueIssues({ group, type, ...pair }))];
};

/**
 * How a rejection names the patch's own settings. They belong to no block, so the group name a
 * block's params are reported under has nothing to stand in for it.
 */
const PATCH_GROUP = "patch";

/**
 * Every problem with the patch's own settings. They take the same check a block's params get,
 * since they are ordinary params that happen to sit on the patch rather than inside a block.
 *
 * `values` may carry a whole patch spec, blocks and all: a key with no spec is skipped, the same
 * way `validateTypeParams` leaves an unknown param key to the key check.
 */
const validatePatchSettings = (caps: DeviceCapabilities, values: Record<string, unknown>): Issues => {
  const paired = pairedWithSpecs(specsByKey(caps.patchSettings), values);
  return paired.flatMap(pair => valueIssues({ group: PATCH_GROUP, ...pair }));
};

// ── Rejection messages for a block's keys ─────────────────────────────────────
//
// Naming the rejected keys and stopping there leaves the caller to work out whether a key was wrong
// or only in the wrong place. Both happen: a control written beside the block's own selectors rather
// than inside `params` is the commonest mistake, and it reads identically to a typo unless the
// message says which it was. Printing the accepted shape answers both at once, and printing it per
// type means the caller reads the fields that type really has rather than a generic outline.

/** The block a rejected input was addressing, as far as the input itself reveals. */
interface BlockContext {
  group: string;
  /** The chosen type, absent when the caller omitted it or sent something that isn't a string. */
  type?: string;
  /** What that type accepts, absent when nothing resolved it. */
  surface?: TypeSurface;
}

/**
 * Reads the block's own selection back off the input being rejected. This runs on input that
 * already failed validation, so every field is treated as untrusted: an unresolvable type just
 * yields no param keys, and the message falls back to listing fields.
 */
const blockContext = (caps: DeviceCapabilities, group: string, input: unknown): BlockContext => {
  const block = asRecord(input);
  const type = asString(block[TYPE_FIELD]);
  return { group, type, surface: typeSurface(caps, { group, type, subType: block[SUB_TYPE_FIELD] }) };
};

const quoted = (keys: string[]): string => keys.map(key => `"${key}"`).join(", ");

/** One field of the skeleton, filled in where the block's own selection makes it concrete. */
const fieldText = (name: string, block: BlockContext): string => {
  if (name === TYPE_FIELD && block.type !== undefined) return `${TYPE_FIELD}: "${block.type}"`;
  const paramKeys = block.surface?.paramKeys ?? [];
  if (name === PARAMS_FIELD && paramKeys.length > 0) return `${PARAMS_FIELD}: { ${paramKeys.join(", ")} }`;
  return name;
};

/**
 * A field the chosen type can't use is left out. A group of many effects declares one `subType`
 * field on behalf of all of them, so offering it at an effect with no variants sends the caller
 * straight into a second rejection.
 */
const usableFields = (fields: string[], block: BlockContext): string[] => {
  if (block.surface === undefined || block.surface.subTypes.length > 0) return fields;
  return fields.filter(name => name !== SUB_TYPE_FIELD);
};

/**
 * The shape this block accepts, printed rather than described. Nesting is exactly what a prose
 * list of field names loses, and nesting is what the caller got wrong.
 */
const shapeSkeleton = (fields: string[], block: BlockContext): string => {
  const label = block.type === undefined ? block.group : `${block.group} ${block.type}`;
  const body = usableFields(fields, block).map(name => fieldText(name, block)).join(", ");
  return `${label} takes: { ${body} }`;
};

/** Keys that name a real param of the chosen type, sent one level too high. */
const misplacedLine = (keys: string[], block: BlockContext): string => {
  const noun = keys.length === 1 ? "is a param" : "are params";
  const place = keys.length === 1 ? "not a field on the block" : "not fields on the block";
  return `${quoted(keys)} ${noun} of ${block.group} ${block.type}, ${place}.`;
};

/** Keys the chosen type has no param for either. */
const unknownLine = (keys: string[]): string => {
  const noun = keys.length === 1 ? "No field" : "No fields";
  return `${noun} ${quoted(keys)} on this block.`;
};

/** Keys inside `params` that the chosen type has no control for. */
const unknownParamLine = (keys: string[], block: BlockContext): string => {
  const noun = keys.length === 1 ? "is not a param" : "are not params";
  return `${quoted(keys)} ${noun} of ${block.group} ${block.type ?? ""}`.trimEnd() + ".";
};

// ── A whole block spec ────────────────────────────────────────────────────────

/** True when a block spec carries nothing but `on: false`. */
const isBareBypass = (value: unknown): boolean => {
  const entries = Object.entries(asRecord(value));
  return entries.length > 0 && entries.every(([key, entry]) => (key === ON_FIELD ? entry === false : entry === undefined));
};

/**
 * The blocks a spec actually sets, in the chain's own order, with the ones written off folded into
 * the ones left out. `{ on: false }` on its own says what leaving the block out says, off at factory
 * defaults, and the builder writes the same bytes for both, so folding them here keeps one path
 * rather than a second that could drift from it.
 */
const setBlocks = (caps: DeviceCapabilities, spec: Record<string, unknown>): string[] =>
  Object.entries(caps.chain.blocks)
    .filter(([name, block]) => spec[name] !== undefined && !(block.bypass && isBareBypass(spec[name])))
    .map(([name]) => name);

/** Every field name a block accepts: what selects its shape, then the one key its controls go under. */
const acceptedFields = (caps: DeviceCapabilities, name: string, capGroup: CapabilityGroup): string[] => {
  const selectors = capGroup.types.length > 0 ? [TYPE_FIELD, SUB_TYPE_FIELD] : [];
  const bypass = chainBlock(caps, name)?.bypass === false ? [] : [ON_FIELD];
  return [...selectors, ...bypass, PARAMS_FIELD];
};

/** One block's rejected keys, alongside the block they were sent to. */
interface KeyCheck {
  fields: string[];
  context: BlockContext;
}

/**
 * Splits the keys a block doesn't take into the two mistakes that produce them: a real param of the
 * chosen type sent one level too high, and a key the type has no param for at all. Either way the
 * accepted shape is printed back, since nesting is what a prose list of field names can't show and
 * nesting is what the caller got wrong.
 */
const keyIssues = (block: Record<string, unknown>, check: KeyCheck): Issues => {
  const { fields, context } = check;
  const rejected = Object.keys(block).filter(key => !fields.includes(key));
  if (rejected.length === 0) return [];

  const paramKeys = context.surface?.paramKeys ?? [];
  const misplaced = fields.includes(PARAMS_FIELD) ? rejected.filter(key => paramKeys.includes(key)) : [];
  const unknown = rejected.filter(key => !misplaced.includes(key));
  const misplacedText = misplaced.length > 0 ? [misplacedLine(misplaced, context)] : [];
  const unknownText = unknown.length > 0 ? [unknownLine(unknown)] : [];
  return [[...misplacedText, ...unknownText, shapeSkeleton(fields, context)].join("\n")];
};

/**
 * Rejects a control the chosen type has no field for, before the builder does. The builder throws on
 * the first one it meets, and reporting them here puts them alongside every other problem the spec
 * has rather than costing a round trip each.
 */
const paramKeyIssues = (params: Record<string, unknown>, context: BlockContext): Issues => {
  const paramKeys = context.surface?.paramKeys;
  if (paramKeys === undefined) return [];
  const unknown = Object.keys(params).filter(key => !paramKeys.includes(key));
  if (unknown.length === 0) return [];
  return [[unknownParamLine(unknown, context), shapeSkeleton([PARAMS_FIELD], context)].join("\n")];
};

/**
 * Rejects a block whose `type` names nothing the catalog knows. Every later check reads the chosen
 * type's own surface, so an unresolved one would leave the caller's params reported as unknown keys
 * with nothing saying the type was the problem.
 */
const typeIssues = (caps: DeviceCapabilities, capGroup: CapabilityGroup, block: Record<string, unknown>): Issues => {
  if (capGroup.types.length === 0) return [];

  const type = block[TYPE_FIELD];
  if (typeof type !== "string") return [`${capGroup.id} needs a ${TYPE_FIELD}. Types: ${typeChoices(capGroup)}`];
  if (typeSurface(caps, { group: capGroup.id, type }) !== undefined) return [];
  return [unknownTypeIssue(capGroup, type)];
};

/** Every problem with one block of a spec, which `setBlocks` has already confirmed the chain names. */
const blockSpecIssues = (caps: DeviceCapabilities, name: string, input: unknown): Issues => {
  const group = caps.chain.blocks[name]?.group ?? name;
  const capGroup = findGroup(caps, group);
  const block = asRecord(input);
  const problems = typeIssues(caps, capGroup, block);
  if (problems.length > 0) return problems;

  const context = blockContext(caps, group, block);
  const params = asRecord(block[PARAMS_FIELD]);
  return [
    ...typeBlockIssues(caps, name, block[TYPE_FIELD]),
    ...selectorIssues({ group, on: block[ON_FIELD], subType: block[SUB_TYPE_FIELD] }),
    ...keyIssues(block, { fields: acceptedFields(caps, name, capGroup), context }),
    ...paramKeyIssues(params, context),
    ...validateTypeParams(caps, { group, type: context.type, subType: asString(block[SUB_TYPE_FIELD]), values: params }),
  ];
};

/**
 * Every problem the catalog can find in a patch spec: its settings, and each block it sets. What
 * only the device knows (the characters a name may use, the order a chain may take, which top-level
 * keys it accepts) is the driver's to add.
 */
const validateSpec = (caps: DeviceCapabilities, spec: Record<string, unknown>): Issues => [
  ...validatePatchSettings(caps, spec),
  ...setBlocks(caps, spec).flatMap(name => blockSpecIssues(caps, name, spec[name])),
];

// ── Dot-path edits ────────────────────────────────────────────────────────────
//
// A path is read against the patch itself rather than against the catalog, because the decoded
// patch carries every field the device supports and nothing else: a segment that isn't there names
// a control the device doesn't have. Accepting such a write would strand it, since the encoder
// emits only byte indices it knows, leaving the caller believing an edit landed while the file kept
// its old value.
//
// Resolving a path proves only that the field exists, which is a different question from whether
// the value belongs in it: `<block>.params.gain=abc` names a real field. The catalog check that
// follows is the same one a spec gets, so the two write paths cannot drift in what they accept.

/** Where a dot-path ends up: the record its last segment lives in, and that segment. */
interface Field {
  holder: Record<string, unknown>;
  key: string;
}

/**
 * Names what is actually available at the level a path went wrong, so a caller who guessed a field
 * name is told the real ones rather than left to guess again.
 */
const unknownPathIssue = (dottedPath: string, segment: string, available: Record<string, unknown>): string => {
  const valid = Object.keys(available).sort().join(", ");
  return `Unknown field path "${dottedPath}": "${segment}" is not a field here. ` +
    `Valid fields at this level: ${valid}`;
};

/** The field a path names, or the reason it names none. */
type Resolution = { field: Field } | { issue: string };

const fieldAt = (target: Record<string, unknown>, dottedPath: string): Resolution => {
  const parts = dottedPath.split(".");
  const key = parts.pop() ?? dottedPath;
  let current = target;
  for (const [depth, part] of parts.entries()) {
    const next = current[part];
    if (next === null || typeof next !== "object") {
      return { issue: unknownPathIssue(dottedPath, parts.slice(0, depth + 1).join("."), current) };
    }
    current = next as Record<string, unknown>;
  }

  if (!(key in current)) return { issue: unknownPathIssue(dottedPath, key, current) };
  return { field: { holder: current, key } };
};

/**
 * The words that stand in for a number somewhere in the catalog, such as a time played against the
 * patch tempo. A field holding one is still a numeric field, so it can be set back to a number.
 */
const namedNumbersCache = new WeakMap<DeviceCapabilities, ReadonlySet<string>>();

const paramsOf = (caps: DeviceCapabilities): ParamSpec[] => {
  const types = caps.groups.flatMap(group => group.types);
  const variants = types.flatMap(type => type.subTypes ?? []);
  return [
    ...caps.patchSettings,
    ...caps.groups.flatMap(group => group.params ?? []),
    ...[...types, ...variants].flatMap(type => type.params ?? []),
  ];
};

const namedNumbers = (caps: DeviceCapabilities): ReadonlySet<string> => {
  const cached = namedNumbersCache.get(caps);
  if (cached !== undefined) return cached;
  const names = new Set(paramsOf(caps).flatMap(spec => (spec.kind === "numericOrNamed" ? spec.values : [])));
  namedNumbersCache.set(caps, names);
  return names;
};

/**
 * Interprets a value against the field it is going into: "72" becomes the number 72 and "true"
 * becomes a boolean, but only where `existing` shows the field is not itself a string. A command
 * line can express a number no other way, so the coercion has to happen somewhere; doing it blind
 * turns a patch named "1984" into the number 1984, which the name encoder cannot pad to the block's
 * width. A field holding one of the catalog's named numbers still counts as numeric, or a control
 * synced to a note could never be set back to a number. A value that arrives already typed is taken
 * as it is.
 */
const coerceValue = (value: FieldValue, existing: unknown, named: ReadonlySet<string>): FieldValue => {
  const holdsText = typeof existing === "string" && !named.has(existing);
  if (typeof value !== "string" || holdsText) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  const result = Number.isNaN(asNumber) ? value : asNumber;
  return result;
};

/** One edit resolved against the block it addresses. */
interface EditedField {
  leaf: string;
  /** A control of the block's chosen type, as opposed to a field selecting that type. */
  isParam: boolean;
  value: unknown;
}

/** The block and field one path addresses. */
interface EditTarget {
  block: string;
  field: Omit<EditedField, "value">;
}

/**
 * Which block and field a path addresses, or undefined for a path that names no block at all (the
 * name, the chain, a patch setting) or reaches deeper than a block's controls.
 *
 * Every block keeps its controls one level down in `params`, so the path says which kind of thing
 * it touches: `<block>.on` is block state and `<block>.params.<control>` is a control.
 */
const editTarget = (caps: DeviceCapabilities, path: string): EditTarget | undefined => {
  const [head, ...rest] = path.split(".");
  if (head === undefined || chainBlock(caps, head) === undefined) return undefined;

  const [leaf, nestedLeaf, ...deeper] = rest;
  if (leaf === PARAMS_FIELD && nestedLeaf !== undefined && deeper.length === 0) {
    return { block: head, field: { leaf: nestedLeaf, isParam: true } };
  }
  if (leaf === undefined || nestedLeaf !== undefined || !SELECTION_FIELDS.has(leaf)) return undefined;
  return { block: head, field: { leaf, isParam: false } };
};

/** A path addressing no block is dropped here; `patchSettingEdits` is what picks those up. */
const editsByBlock = (caps: DeviceCapabilities, edits: Record<string, unknown>): Map<string, EditedField[]> => {
  const byBlock = new Map<string, EditedField[]>();
  for (const [path, value] of Object.entries(edits)) {
    const target = editTarget(caps, path);
    if (target === undefined) continue;
    const found = byBlock.get(target.block) ?? [];
    found.push({ ...target.field, value });
    byBlock.set(target.block, found);
  }
  return byBlock;
};

/** Problems with a `type` edit: one the catalog doesn't know, or one this block can't hold. */
const typeEditIssues = (caps: DeviceCapabilities, name: string, value: unknown): Issues => {
  const group = caps.chain.blocks[name]?.group ?? name;
  if (resolveSelection(caps, group, value)?.capType === undefined) {
    return [unknownTypeIssue(findGroup(caps, group), value)];
  }
  return typeBlockIssues(caps, name, value);
};

/**
 * Whether a block's controls belong to the type it is set to rather than to the block as a whole.
 * An amp has the same controls whichever amp it models, so switching one has to leave the gain the
 * player dialed in; an effect slot's controls are the effect's own, so the previous effect's have
 * to go.
 */
const controlsFollowType = (capGroup: CapabilityGroup): boolean =>
  capGroup.types.some(type => (type.params?.length ?? 0) > 0);

/** The same question of a sub-model: true only where picking one is what decides the controls. */
const controlsFollowSubType = (capType: CapabilityType): boolean =>
  (capType.subTypes ?? []).some(variant => (variant.params?.length ?? 0) > 0);

/** What an edit engine needs of a device: its catalog, and a way to build a block at factory settings. */
type EditingDevice = Pick<PatchDriver, "capabilities" | "buildPatch">;

/** The block a re-seed builds: the selection now on the block, and no controls at all. */
const factorySpec = (block: Record<string, unknown>, subType: unknown): Record<string, unknown> => ({
  [TYPE_FIELD]: block[TYPE_FIELD],
  [SUB_TYPE_FIELD]: subType,
  [ON_FIELD]: block[ON_FIELD],
  [PARAMS_FIELD]: {},
});

/** Whether the selection an edit just landed decides the block's controls. */
const selectionMovesControls = (selection: Selection, isTypeEdit: boolean): boolean => {
  if (selection.capType === undefined) return false;
  const follows = isTypeEdit ? controlsFollowType(selection.capGroup) : controlsFollowSubType(selection.capType);
  return follows;
};

/** Names a patch the builder accepts on every device, for the one block a re-seed takes from it. */
const RESEED_NAME = "reseed";

/**
 * The block the device builds for a selection at factory settings, or undefined when it refuses the
 * selection. Any refusal is one the checks after the batch report in full, alongside the rest.
 */
const factoryBlock = (device: EditingDevice, name: string, spec: Record<string, unknown>): Record<string, unknown> | undefined => {
  try {
    const built = device.buildPatch({ name: RESEED_NAME, [name]: spec });
    return asRecord((built as unknown as Record<string, unknown>)[name]);
  } catch {
    return undefined;
  }
};

/**
 * Re-seeds a block whose selection an edit just changed, to the device's factory settings for the
 * selection it now carries.
 *
 * A decoded block holds only its current type's controls, so without this a switch leaves the
 * previous effect's values behind and the codec reads them under the new type's field map: a
 * compressor's sustain byte comes back as a delay time nobody chose. Re-seeding as the edit lands
 * rather than after the batch is also what makes a control of the new type a field the paths that
 * follow can find, so a type and a control of it can be set in one call.
 *
 * The device builds the factory block, and only its selectors and controls are copied across, so
 * the bytes the block keeps outside them stay the patch's own. A selection the catalog cannot
 * resolve, one this block cannot hold, or one the builder refuses is left alone: the checks that
 * run after the batch report each of them with everything else wrong in the batch.
 */
const reseedBlock = (device: EditingDevice, patch: Patch, target: { name: string; leaf: string }): void => {
  const caps = device.capabilities;
  const block = asRecord((patch as unknown as Record<string, unknown>)[target.name]);
  const type = asString(block[TYPE_FIELD]);
  const group = caps.chain.blocks[target.name]?.group;
  if (type === undefined || group === undefined || typeBlockIssues(caps, target.name, type).length > 0) return;
  const selection = resolveSelection(caps, group, type);
  const isTypeEdit = target.leaf === TYPE_FIELD;
  if (selection === undefined || !selectionMovesControls(selection, isTypeEdit)) return;

  // A new type arrives on the device's factory sub-model, since the model the previous type was set
  // to names nothing under this one and the codec has no field map for the pairing.
  const subType = isTypeEdit ? undefined : block[SUB_TYPE_FIELD];
  const fresh = factoryBlock(device, target.name, factorySpec(block, subType)) ?? {};
  for (const field of [TYPE_FIELD, SUB_TYPE_FIELD, ON_FIELD, PARAMS_FIELD]) {
    if (field in fresh) block[field] = fresh[field];
  }
};

/** Re-seeds when the edit that landed picked a shape; every other path leaves its block alone. */
const reseedForEdit = (device: EditingDevice, patch: Patch, path: string): void => {
  const target = editTarget(device.capabilities, path);
  if (target === undefined || target.field.isParam) return;
  const { leaf } = target.field;
  if (leaf !== TYPE_FIELD && leaf !== SUB_TYPE_FIELD) return;
  reseedBlock(device, patch, { name: target.block, leaf });
};

/** Which of the checked selectors a non-type selection field sets. */
const selectorKey = (leaf: string): "on" | "subType" => (leaf === ON_FIELD ? "on" : "subType");

/**
 * The selection is read off the patch rather than off the edits, so it reflects a type set in the
 * same batch. Validating `<block>.params.time` against the type the block held before the batch
 * would reject an edit that is only inconsistent when the two are read apart.
 */
const blockEditIssues = (caps: DeviceCapabilities, patch: Patch, edited: { name: string; fields: EditedField[] }): Issues => {
  const group = caps.chain.blocks[edited.name]?.group ?? edited.name;
  const block = asRecord((patch as unknown as Record<string, unknown>)[edited.name]);
  const issues: Issues = [];
  const values: Record<string, unknown> = {};

  const selectors: Selectors = { group };
  for (const { leaf, isParam, value } of edited.fields) {
    if (isParam) values[leaf] = value;
    else if (leaf === TYPE_FIELD) issues.push(...typeEditIssues(caps, edited.name, value));
    else selectors[selectorKey(leaf)] = value;
  }
  issues.push(...selectorIssues(selectors));

  const selection = { group, type: asString(block[TYPE_FIELD]), subType: asString(block[SUB_TYPE_FIELD]) };
  issues.push(...validateTypeParams(caps, { ...selection, values }));
  return issues;
};

/**
 * The edits that named a patch setting rather than a block. A setting sits at the top level of the
 * patch, so its path is a single segment, and the catalog decides which of those are settings: the
 * patch name lands here too and passes through unchecked, having no spec to check against.
 */
const patchSettingEdits = (edits: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(edits).filter(([path]) => !path.includes(".")));

/**
 * Every problem with a set of edits, empty when they are all usable. The patch must already carry
 * them: each block's type comes from the patch, which is what lets a type change and a param of the
 * new type validate as the one consistent state they describe.
 */
const validateFieldEdits = (caps: DeviceCapabilities, patch: Patch, edits: Record<string, unknown>): Issues => [
  ...validatePatchSettings(caps, patchSettingEdits(edits)),
  ...[...editsByBlock(caps, edits)].flatMap(([name, fields]) => blockEditIssues(caps, patch, { name, fields })),
];

/**
 * Applies a batch of edits in the order given and returns what each one wrote, throwing with every
 * problem at once when any of them is unusable.
 *
 * An unresolvable path lands nowhere and the rest of the batch still applies, because the check
 * that follows reads each block's selection off the patch: an edit setting a type and an edit
 * setting a param of that new type are one consistent state only once both are on it. Order is the
 * caller's, so a control named before the type that has it still resolves against the type the
 * block held at the time. The patch is left partly edited on a throw, so a caller writes the file
 * only after this returns.
 */
const applyEdits = (device: EditingDevice, patch: Patch, edits: readonly FieldEdit[]): FieldEdits => {
  const fields = patch as unknown as Record<string, unknown>;
  const named = namedNumbers(device.capabilities);
  const applied: FieldEdits = {};
  const issues: Issues = [];

  for (const [path, given] of edits) {
    const resolved = fieldAt(fields, path);
    if ("issue" in resolved) {
      issues.push(resolved.issue);
      continue;
    }
    const { holder, key } = resolved.field;
    const previous = holder[key];
    const value = coerceValue(given, previous, named);
    holder[key] = value;
    applied[path] = value;
    // Only a selection that actually moved: re-seeding on a value the block already had would
    // discard the controls of a caller writing back the type a patch they just read reported.
    if (value !== previous) reseedForEdit(device, patch, path);
  }

  issues.push(...validateFieldEdits(device.capabilities, patch, applied));
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return applied;
};

export { applyEdits, asRecord, setBlocks, validateSpec, validateTypeParams, validatePatchSettings };
export type { EditingDevice, Issues, TypeParams };
