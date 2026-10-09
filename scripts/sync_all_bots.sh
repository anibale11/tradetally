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
BOT=/home/anibale/Documentos/Claude/bot_trading
TT=/home/anibale/Documentos/Claude/trade-journal-eval/tradetally

echo "=== $(date '+%F %T') sync_all_bots ==="

ssh -o ConnectTimeout=15 trading-server "cd /opt/nautilus_trading && python3 sync_trades_from_okx.py" 2>&1 | tail -2 \
  || echo "WARN: sync OKX en el VPS falló"
"$NAUT/scripts/sync_nautilus_trades.sh" || echo "WARN: copia nautilus falló"
"$BOT/scripts/sync_trades_export.sh" || echo "WARN: copia bot_trading falló"

# DCA Range Trading (nautilus-trading) en su subcuenta OKX: mismo sync con las
# keys de .env.subcuenta y su propio JSONL/cutoff.
# DCA_CUTOFF se actualiza a la hora UTC de arranque del nodo en el deploy.
DCA_CUTOFF="2026-10-09T00:00:00Z"
ssh -o ConnectTimeout=15 trading-server "cd /opt/nautilus_trading && test -f .env.subcuenta && python3 sync_trades_from_okx.py --env .env.subcuenta --out data/nautilus_dca_trades.jsonl --cutoff \"$DCA_CUTOFF\"" 2>&1 | tail -2 || true
if scp -q -o ConnectTimeout=10 trading-server:/opt/nautilus_trading/data/nautilus_dca_trades.jsonl "$NAUT/data/nautilus_dca_trades.jsonl.tmp" 2>/dev/null; then
  mv "$NAUT/data/nautilus_dca_trades.jsonl.tmp" "$NAUT/data/nautilus_dca_trades.jsonl"
else
  echo "INFO: DCA sin trades todavía"
fi

new=0
# Cada import: "<nombre>|<script>|<variables -e para docker exec>"
IMPORTS=(
  "nautilus-smc|importNautilusTrades|-e IMPORT_CUTOFF=2026-10-07T23:59:00Z"
  "bot_trading|importBotTradingTrades|"
  "nautilus-dca|importNautilusTrades|-e IMPORT_TRADES_FILE=nautilus_dca_trades.jsonl -e IMPORT_CUTOFF=$DCA_CUTOFF"
)
for entry in "${IMPORTS[@]}"; do
  IFS='|' read -r label s envs <<< "$entry"
  # $envs explícito también para el SMC: el corte queda en el script aunque
  # la imagen de la app no se haya reconstruido con el default nuevo.
  if [ "$label" = "nautilus-dca" ]; then
    # Sin archivo todavía (la subcuenta no operó): no es un fallo.
    if [ ! -f "$NAUT/data/nautilus_dca_trades.jsonl" ]; then continue; fi
    out=$(docker exec $envs -e "IMPORT_BROKER_NAME=nautilus-trading (DCA Range — OKX demo subcuenta)" \
          -e "IMPORT_STRATEGY_NAME=DCA Range Trading Craig (Nautilus)" tradetally-app node "backend/src/scripts/$s.js" 2>&1)
  else
    out=$(docker exec $envs tradetally-app node "backend/src/scripts/$s.js" 2>&1)
  fi
  # Sin línea "Resumen" el import no terminó (ej. DB caída) — antes esto se
  # reportaba en silencio como "sin trades nuevos".
  if ! echo "$out" | grep -q "Resumen:"; then
    echo "WARN: import $label falló:"
    echo "$out" | tail -3
  fi
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
