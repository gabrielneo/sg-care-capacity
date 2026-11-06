import Link from "next/link";

import { EmptyState } from "@/components/States";

export default function NotFound() {
  return <EmptyState title="Page not found" message="That page doesn't exist." action={<Link href="/">Go to the overview</Link>} />;
}
