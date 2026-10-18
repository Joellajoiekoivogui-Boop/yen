#!/usr/bin/env bash
# Réinitialise les compteurs de limitation de débit de la base de TEST (jamais en production).
psql "${PG_ADMIN_URL%/*}/${DB_NAME:-yen_e2e}" -q -c "truncate public.rate_limits"
