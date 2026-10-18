# Intégrations externes

Aucune intégration externe n'est présentée comme opérationnelle tant qu'elle n'est pas configurée. L'état réel est
visible dans *Administration → Paramètres → État des intégrations externes*.

## Fournisseur d'IA

| Variable | Valeur |
|---|---|
| `AI_PROVIDER` | `anthropic` (ou `none` pour désactiver) |
| `ANTHROPIC_API_KEY` | clé API (console Anthropic) — **serveur uniquement** |
| `AI_MODEL` | `claude-opus-5-5` par défaut |
| `AI_TIMEOUT_MS` | délai maximal par appel (120 000 ms par défaut) |

- Couche d'abstraction : `src/features/ai/provider.ts` (interface `AIProvider`). Pour un autre fournisseur, implémenter
  `generateJson` et `chat`, puis l'ajouter dans `getAIProvider()`.
- Sorties structurées validées par Zod (`src/features/ai/schemas.ts`) ; *fallback* serveur activé en cas de refus du modèle.
- Les PDF scannés sont lus par le modèle (entrée document PDF) : c'est le mécanisme d'OCR.
- **Sans clé** : les boutons IA sont masqués/inactifs, un message explique qu'une configuration est requise, aucune
  analyse n'est enregistrée ni simulée. Le moteur de compatibilité, les recommandations issues des évaluations et le
  CV généré fonctionnent sans IA.
- Consentement `traitement_ia` exigé côté serveur pour toute analyse d'un candidat (y compris lancée par YEN).
- Coût : chaque analyse est un appel ; des limites par utilisateur et par heure sont appliquées (5 analyses, 40 messages
  d'assistant).

Services disponibles : extraction de CV, analyse de profil (traçable), amélioration de CV (sans invention), plan de
progression, synthèse pour le responsable d'insertion, aide à la correction des réponses libres, assistant candidat.

## Antivirus des CV

`CLAMAV_SCAN_URL` : service REST ClamAV auto-hébergé (ex. image « clamav-rest ») qui reçoit le fichier en
`multipart/form-data` (champ `file`) et répond `{"infected": false}`. Sans configuration, chaque PDF passe le contrôle
structurel (signature réelle, fin de fichier, contenu actif JavaScript/Launch/EmbeddedFile/XFA, chiffrement) et est marqué
« contrôle basique » — pas « sain ».

## Notifications externes (e-mail, SMS, WhatsApp)

Le centre de notifications interne est opérationnel. Les canaux externes ne sont **pas** branchés :
`src/features/notifications/service.ts` expose l'interface `ExternalChannel` et la table `notification_deliveries`
trace chaque tentative. Un envoi externe n'a lieu que si (1) un fournisseur est enregistré dans `channels()`, (2) le
candidat a donné le consentement `notifications_externes`. Variables réservées : `EMAIL_PROVIDER`, `SMS_PROVIDER`,
`WHATSAPP_PROVIDER`.

Les e-mails d'authentification (confirmation, réinitialisation) sont envoyés par Supabase Auth : configurer le SMTP
dans Supabase pour la production.
