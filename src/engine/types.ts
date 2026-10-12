/** A JSON-like value handled by the overlay engine. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON object (the shape of an OpenAPI document or an overlay node). */
export type JsonObject = { [key: string]: JsonValue };

/** A single OpenAPI Overlay 1.0.0 action. */
export interface OverlayAction {
  /** An RFC 9535 JSONPath selecting the target node(s). */
  target: string;
  /** When `true`, delete the matched node(s). */
  remove?: boolean;
  /** When present, deep-merge this value into the matched node(s). */
  update?: JsonValue;
}

/** An OpenAPI Overlay 1.0.0 document. */
export interface OverlayDocument {
  overlay?: string;
  info?: JsonObject;
  actions?: OverlayAction[];
}

/** A resolved selector path: an array of object keys / array indices. */
export type SelectorPath = (string | number)[];
