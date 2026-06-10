// =============================================================================
// AI-HR — Shared TypeScript Types
// =============================================================================

export interface HrDocument {
  id: string;
  document_name: string;
  document_type: string;
  version: string;
  effective_date: string | null;
  created_at: string;
}

export interface HrDocumentContent {
  id: string;
  document_id: string;
  page_no: number;
  bab: string;
  pasal: string;
  ayat: string;
  title: string;
  content: string;
  created_at: string;
}

export interface SearchResult {
  document_name: string;
  document_type: string;
  page_no: number;
  bab: string;
  pasal: string;
  ayat: string;
  title: string;
  content: string;
  rank: number;
}

export interface Reference {
  document: string;
  page: number;
  bab: string;
  pasal: string;
  ayat: string;
}

export interface AskResponse {
  answer: string;
  references: Reference[];
}

export interface ImportResult {
  success: boolean;
  documentId: string;
  documentName: string;
  pageCount: number;
  sectionsImported: number;
}

export interface ParsedSection {
  page_no: number;
  bab: string;
  pasal: string;
  ayat: string;
  title: string;
  content: string;
}
