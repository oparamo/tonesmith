/**
 * The keys every block carries in every device's patches and specs: its own selectors beside one
 * `params` bag. Core's spec checks read blocks by these names and each driver decodes into them,
 * so they are defined once for both.
 */
const TYPE_FIELD = "type";
/**
 * The one name a sub-model selection goes by: in a codec field map, on a decoded block, and in a
 * patch spec. `type` is the block's own selector and never a sub-model's, so the two words each mean
 * exactly one thing.
 */
const SUB_TYPE_FIELD = "subType";
const ON_FIELD = "on";
const PARAMS_FIELD = "params";

/** The fields that select a block's shape rather than set one of its controls. */
const SELECTION_FIELDS: ReadonlySet<string> = new Set<string>([TYPE_FIELD, SUB_TYPE_FIELD, ON_FIELD]);

export { TYPE_FIELD, SUB_TYPE_FIELD, ON_FIELD, PARAMS_FIELD, SELECTION_FIELDS };
