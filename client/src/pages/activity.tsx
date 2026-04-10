import { Redirect } from "wouter";

/** /activity route — redirects to /analytics (activity merged into Analytics). */
export default function ActivityPage() {
  return <Redirect to="/analytics?tab=activity" />;
}
