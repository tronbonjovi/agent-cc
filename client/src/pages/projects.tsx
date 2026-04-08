import { Redirect } from "wouter";

/** /projects route — redirects to /board (project cards live in the workspace). */
export default function Projects() {
  return <Redirect to="/board" />;
}
