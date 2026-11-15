/** A one-sentence takeaway above a card's explanation. Renders nothing when there is no sentence: missing data means no sentence. */
export function Lede({ text, testId }: { text: string | null; testId: string }) {
  if (!text) return null;
  return <span className="mb-1 block" data-testid={testId}>{text}</span>;
}
