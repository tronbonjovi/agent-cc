import { Redirect } from "wouter";

/** /prompts route — redirects to /sessions (prompts merged as tab). */
export default function Prompts() {
  return <Redirect to="/sessions" />;
}
