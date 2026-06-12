import { describe, it, expect } from "vitest";
import { splitSentences } from "./splitSentences";

describe("splitSentences", () => {
  it("returns a single sentence unchanged as a one-element array", () => {
    expect(splitSentences("Les cuento esto hoy.")).toEqual(["Les cuento esto hoy."]);
  });

  it("splits a multi-sentence Spanish paragraph into one segment per sentence", () => {
    const text =
      "Te cuento esto porque hay algo que la mayoría no te dice. " +
      "Quien empieza antes queda protegido. Quien espera empieza de nuevo.";
    expect(splitSentences(text)).toEqual([
      "Te cuento esto porque hay algo que la mayoría no te dice.",
      "Quien empieza antes queda protegido.",
      "Quien espera empieza de nuevo.",
    ]);
  });

  it("keeps a Spanish question as its own segment with the opener attached", () => {
    const text = "Ahora, ¿qué se necesita? Que su empleador esté dispuesto a patrocinarlos.";
    expect(splitSentences(text)).toEqual([
      "Ahora, ¿qué se necesita?",
      "Que su empleador esté dispuesto a patrocinarlos.",
    ]);
  });

  it("does not split a decimal number", () => {
    expect(splitSentences("El proceso sube 30.5 por ciento este año.")).toEqual([
      "El proceso sube 30.5 por ciento este año.",
    ]);
  });

  it("does not split mid-number when a period precedes a digit", () => {
    // "22.30" style — period between digits is never a boundary
    expect(splitSentences("Toma entre 22.30 meses en total.")).toEqual([
      "Toma entre 22.30 meses en total.",
    ]);
  });

  it("splits correctly after a percentage at sentence end", () => {
    const text = "Una regla podría subir los requisitos más del 30%. Y eso cambia todo.";
    expect(splitSentences(text)).toEqual([
      "Una regla podría subir los requisitos más del 30%.",
      "Y eso cambia todo.",
    ]);
  });

  it("does not split a protected abbreviation", () => {
    expect(splitSentences("Vivo en EE.UU. desde hace años.")).toEqual([
      "Vivo en EE.UU. desde hace años.",
    ]);
  });

  it("splits on existing newlines", () => {
    expect(splitSentences("Primera línea\nSegunda línea")).toEqual([
      "Primera línea",
      "Segunda línea",
    ]);
  });

  it("combines newline breaks and sentence splits", () => {
    const text = "Mira esto. Es importante.\nOtra cosa más.";
    expect(splitSentences(text)).toEqual([
      "Mira esto.",
      "Es importante.",
      "Otra cosa más.",
    ]);
  });

  it("trims whitespace and drops empty segments", () => {
    expect(splitSentences("  Hola.   Adiós.  ")).toEqual(["Hola.", "Adiós."]);
  });

  it("preserves every non-whitespace character (rejoin invariant) for every split", () => {
    const texts = [
      "Te cuento esto porque hay algo. Quien empieza antes queda protegido.",
      "Ahora, ¿qué se necesita? Que su empleador esté dispuesto.",
      "Una regla podría subir más del 30%. Y eso cambia todo.",
      "Vivo en EE.UU. desde hace años.",
    ];
    for (const t of texts) {
      const joined = splitSentences(t).join("").replace(/\s+/g, "");
      expect(joined).toBe(t.replace(/\s+/g, ""));
    }
  });

  it("handles an exclamation between sentences", () => {
    expect(splitSentences("¡Increíble! Nadie te lo dijo.")).toEqual([
      "¡Increíble!",
      "Nadie te lo dijo.",
    ]);
  });

  it("returns empty array for empty or whitespace-only input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n  ")).toEqual([]);
  });
});
