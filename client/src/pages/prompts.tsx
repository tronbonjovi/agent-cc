import { Redirect } from "wouter";

/** /prompts route — redirects to /messages (prompts merged there). */
export default function Prompts() {
  return <Redirect to="/messages" />;
}
