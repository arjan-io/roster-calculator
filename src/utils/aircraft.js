import { clean } from "./normalizers.js";

export function normalizeAircraftModel(value) {
  const model = clean(value).toUpperCase().replace(/\s+/g, "");

  if (/^\d{3}$/.test(model)) {
    return `A${model}`;
  }

  return model;
}
