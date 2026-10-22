import { ViewTransition, type ReactNode } from "react";

/**
 * Transition entre les pages du site public : l'ancienne page s'efface, la nouvelle monte
 * légèrement en fondu (animations dans globals.css, section « Transitions entre pages »).
 * Le gabarit est recréé à chaque navigation, ce qui déclenche l'entrée et la sortie ;
 * sans prise en charge par le navigateur, ou si l'utilisateur réduit les animations,
 * la page change simplement sans effet.
 */
export default function PublicTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
