import type {
  ConfidenceLevel,
  ElementReference,
  ExtractionCandidate,
  ExtractionResult,
  ExtractionState,
} from "@shared/types";
import { CONFIDENCE_THRESHOLDS } from "@shared/constants";
import { createId } from "@shared/utils/id";
import { stableSelector } from "@shared/utils/selector";

/**
 * Extraction Engine — discovers and scores article candidates on the frozen
 * page. The scoring pipeline stays pure and DOM-free so it can be unit-tested
 * without a browser; the engine is a thin wrapper over those functions.
 */

export interface ExtractionEngine {
  run(): Promise<ExtractionResult>;
  getState(): ExtractionState;
}

/** Heuristic score based on container size, text density, and link density. */
export function scoreCandidate(node: HTMLElement): number {
  const text = node.innerText ?? "";
  const textLength = text.trim().length;
  const links = node.querySelectorAll("a").length;

  if (textLength === 0) return 0;

  const sizeScore = Math.min(1, Math.log2(Math.max(1, textLength)) / 12);
  const densityScore = textLength / Math.max(1, textLength + links * 40);
  const score = (sizeScore * 0.7 + densityScore * 0.3) * 100;
  return Math.round(score);
}

export function confidenceForScore(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.high * 100) return "HIGH";
  if (score >= CONFIDENCE_THRESHOLDS.medium * 100) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}

export class DefaultExtractionEngine implements ExtractionEngine {
  private state: ExtractionState = { status: "NOT_RUN" };

  async run(): Promise<ExtractionResult> {
    this.state = { status: "RUNNING" };

    try {
      const candidates = this.discoverCandidates();
      const result: ExtractionResult = {
        status: "SUCCESS",
        confidence: confidenceForScore(candidates[0]?.score ?? 0),
        candidates,
      };
      const article = candidates[0]?.element;
      if (article !== undefined) result.article = article;
      this.state = { status: "SUCCESS", result };
      return result;
    } catch {
      this.state = { status: "FAILED" };
      return {
        status: "FAILED",
        confidence: "NONE",
        candidates: [],
      };
    }
  }

  getState(): ExtractionState {
    return { ...this.state };
  }

  private discoverCandidates(): ExtractionCandidate[] {
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>("article, main, section, div, td"),
    ).filter((el) => {
      if (el.closest("[data-newsclean-marker]")) return false;
      return (el.innerText ?? "").trim().length > 120;
    });

    return blocks
      .map((element) => {
        const score = scoreCandidate(element);
        return {
          id: createId("candidate"),
          element,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ id, element, score }) => ({
        id,
        element: elementReferenceOf(element, id),
        role: "ARTICLE" as const,
        score,
        confidence: confidenceForScore(score),
        reasons: ["High text density", "Low link ratio"],
      }));
  }
}

export function elementReferenceOf(element: HTMLElement, id: string): ElementReference {
  return {
    id,
    tagName: element.tagName.toLowerCase(),
    selector: stableSelector(element),
  };
}
