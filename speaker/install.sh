#!/bin/sh
# Ставит бэкенд Alice-App на колонку.
# Запуск:  ./install.sh [ip]      (по умолчанию 192.168.1.20)
set -e
cd "$(dirname "$0")"
IP=${1:-192.168.1.20}
ADB=${ADB:-adb}
SSH=${SSH:-ssh}

echo "[1/6] подключение к $IP:5555"
"$ADB" connect "$IP:5555" >/dev/null 2>&1 || true
"$ADB" get-state 2>/dev/null | grep -q device || { echo "ADB недоступен"; exit 1; }

echo "[2/6] каталоги"
"$ADB" shell 'mkdir -p /data/opt/alice/cgi-bin /data/opt/alice/logs /data/opt/www'

echo "[3/6] api.sh + lighttpd.conf"
"$ADB" push api.sh /data/opt/alice/cgi-bin/api.sh >/dev/null
"$ADB" push lighttpd.conf /data/opt/alice/lighttpd.conf >/dev/null
"$ADB" shell 'chmod +x /data/opt/alice/cgi-bin/api.sh'

if [ -d ../web ]; then
  echo "[3b] интерфейс (web/)"
  "$ADB" shell 'rm -rf /data/opt/www/*'
  for f in ../web/*; do "$ADB" push "$f" /data/opt/www/ >/dev/null; done
fi

echo "[4/6] автозапуск /etc/init.d/S96alice"
"$ADB" shell 'mount -o remount,rw /'
"$ADB" push S96alice /etc/init.d/S96alice >/dev/null
"$ADB" shell 'chmod +x /etc/init.d/S96alice && sync && mount -o remount,ro /'

echo "[5/6] перезапуск"
"$ADB" shell '/etc/init.d/S96alice restart' 2>&1 | tail -3

echo "[6/6] проверка"
sleep 1
if command -v curl >/dev/null; then
  curl -fsS "http://$IP:8080/cgi-bin/api.sh?a=ping" && echo
else
  "$ADB" shell "wget -qO- 'http://127.0.0.1:8080/cgi-bin/api.sh?a=ping'" && echo
fi
echo "Готово: http://$IP:8080/"
