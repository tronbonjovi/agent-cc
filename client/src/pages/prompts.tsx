import { Redirect } from "wouter";

/** /prompts route — redirects to /analytics?tab=sessions (prompts merged into sessions, now under analytics). */
export default function Prompts() {
  return <Redirect to="/analytics?tab=sessions" />;
}
