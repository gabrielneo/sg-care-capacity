import { ViewSwitch } from "@/components/ViewSwitch";
import { parseView } from "@/lib/homeViews";

/**
 * The header's view control, for the home page. A layout can't read the query string, but a slot's
 * page can: this one reads ?view= on the server, so the control is in the first HTML with
 * the right view chosen, and works as a plain form without JavaScript. Only "/" matches this page;
 * on a full load of any other address the slot renders default.tsx, which is nothing.
 */
export default async function ViewBar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <ViewSwitch view={parseView(params.view)} />;
}
