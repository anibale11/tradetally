#!/bin/bash
# Ciclo completo de sincronización de trades de ambos bots hacia TradeTally.
# Pensado para cron local (cada 2h). Los pasos son independientes: si uno
# falla se sigue con el resto.
#
# El reinicio de la app al final es intencional: el caché de analytics vive
# en memoria del proceso servidor (TTL 24h) y los scripts de import corren
# en un proceso Node aparte, así que su AnalyticsCache.invalidate() NO llega
# al servidor real — sin reiniciar, el calendario/dashboard seguirían
# mostrando datos viejos hasta 24h. Solo se reinicia si entraron trades nuevos.
set -u

NAUT=/home/anibale/Documentos/Claude/nautilus-trading
BOT=/home/anibale/Documentos/Claude/bot_trading/.claude/worktrees/score-fibonacci-fix
TT=/home/anibale/Documentos/Claude/trade-journal-eval/tradetally

echo "=== $(date '+%F %T') sync_all_bots ==="

ssh -o ConnectTimeout=15 trading-server "cd /opt/nautilus_trading && python3 sync_trades_from_okx.py" 2>&1 | tail -2 \
  || echo "WARN: sync OKX en el VPS falló"
"$NAUT/scripts/sync_nautilus_trades.sh" || echo "WARN: copia nautilus falló"
"$BOT/scripts/sync_trades_export.sh" || echo "WARN: copia bot_trading falló"

new=0
for s in importNautilusTrades importBotTradingTrades; do
  out=$(docker exec tradetally-app node "backend/src/scripts/$s.js" 2>&1)
  echo "$out" | grep -E "Resumen|Importado"
  n=$(echo "$out" | grep -oP 'Resumen: \K[0-9]+(?= importados)' | tail -1)
  new=$((new + ${n:-0}))
done

if [ "$new" -gt 0 ]; then
  echo "$new trades nuevos — reiniciando tradetally-app para refrescar el caché"
  (cd "$TT" && docker compose restart app 2>&1 | tail -1)
else
  echo "sin trades nuevos"
fi
