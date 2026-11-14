/** A figure that is missing, shown as a dash and read as words (audit L4). Missing stays missing: never 0. */
export function Missing({ why = "no complete week" }: { why?: string }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{why}</span>
    </>
  );
}
