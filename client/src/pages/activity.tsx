import { Redirect } from "wouter";

/** /activity route — redirects to /stats (activity merged into Analytics). */
export default function ActivityPage() {
  return <Redirect to="/stats?tab=activity" />;
}
