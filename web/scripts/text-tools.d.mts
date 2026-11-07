export function proseFromMarkdown(md: string): { line: number; text: string }[];
export function sentences(text: string): string[];
export function words(text: string): string[];
export function syllables(word: string): number;
export function fleschKincaid(text: string): { grade: number; sentences: number; words: number };
