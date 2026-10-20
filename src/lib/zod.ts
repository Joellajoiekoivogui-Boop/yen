import { z } from "zod";

// Sans compilation à la volée (new Function) : compatible avec la politique de
// sécurité du contenu (pas de 'unsafe-eval'). Doit précéder toute création de schéma.
z.config({ jitless: true });

export { z };
