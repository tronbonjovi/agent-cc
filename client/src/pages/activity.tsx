import { Redirect } from "wouter";

/** /activity route — redirects to /analytics?tab=nerve-center (activity merged into Nerve Center). */
export default function ActivityPage() {
  return <Redirect to="/analytics?tab=nerve-center" />;
}
