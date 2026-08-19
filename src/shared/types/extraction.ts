import type { ElementReference } from "./element";

export type ExtractionStatus = "NOT_RUN" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";

/**
 * Shared confidence terminology across Extraction and user-facing features.
 * Numeric scores stay internal; only levels cross the domain boundary.
 */
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type ExtractionRole =
  | "ARTICLE"
  | "TITLE"
  | "SUBTITLE"
  | "HERO_IMAGE"
  | "BODY"
  | "AUTHOR"
  | "PUBLICATION_DATE"
  | "SOURCE"
  | "LOGO";

export interface ExtractionCandidate {
  element: ElementReference;
  role: ExtractionRole;
  score: number;
  confidence: ConfidenceLevel;
  reasons: string[];
}

export interface ExtractionResult {
  status: ExtractionStatus;
  confidence: ConfidenceLevel;

  article?: ElementReference;
  title?: ElementReference;
  subtitle?: ElementReference;
  heroImage?: ElementReference;
  body?: ElementReference;
  author?: ElementReference;
  publicationDate?: ElementReference;
  source?: ElementReference;
  logo?: ElementReference;

  candidates: ExtractionCandidate[];
}

/** Session wrapper: tracks whether extraction has run and its last result. */
export interface ExtractionState {
  status: ExtractionStatus;
  result?: ExtractionResult;
}

export interface PageType {
  type: "ARTICLE" | "ARTICLE_LIST" | "UNKNOWN";
}
