#!/bin/sh
# ══════════════════════════════════════════════════════════════
#  Alice-App · API колонки (CGI для lighttpd, порт 8080)
#  Тонкий «приниматель и отдатчик команд»: принимает запрос,
#  исполняет, возвращает JSON.
# ══════════════════════════════════════════════════════════════
export PATH=/data/opt/bin:/opt/bin:/opt/sbin:/system/vendor/quasar:/bin:/sbin:/usr/bin:/usr/sbin
BASE=/data/opt/alice
PIN_FILE=$BASE/pin
TOKEN_FILE=$BASE/token
LOGDIR=$BASE/logs
YSE_LOG=$LOGDIR/yse.log
mkdir -p "$LOGDIR" 2>/dev/null

echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo "Access-Control-Allow-Headers: Content-Type"
echo "Access-Control-Allow-Methods: GET, POST, OPTIONS"
echo ""
[ "$REQUEST_METHOD" = "OPTIONS" ] && { echo "{}"; exit 0; }

# ---------- утилиты ----------
urldecode() { echo -e "$(echo "$1" | sed 's/+/ /g; s/%/\\x/g')" 2>/dev/null || echo "$1"; }

PARAMS="$QUERY_STRING"
[ "$REQUEST_METHOD" = "POST" ] && BODY=$(head -c 65536) && PARAMS="$PARAMS&$BODY"

g() {  # g <имя> -> значение
  v=$(printf '%s' "$PARAMS" | tr '&' '\n' | grep "^$1=" | head -1 | cut -d= -f2-)
  urldecode "$v"
}

je() {  # экранирование строки для JSON
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | awk '{ ORS=""; if (NR>1) printf "\\n"; printf "%s", $0 }'
}

ok()  { printf '{"ok":1,%s}\n' "$1"; }
err() { printf '{"ok":0,"error":"%s"}\n' "$(je "$1")"; }

run() { out=$("$@" 2>&1); rc=$?; printf '{"ok":1,"rc":%d,"out":"%s"}' "$rc" "$(je "$out")"; }

# ---------- доступ ----------
#  PIN НЕОБЯЗАТЕЛЕН:
#    его нет  → панель открыта (для своей сети), токен не нужен;
#    есть     → вход по PIN (auth), дальше все действия — по токену.
ACTION=$(g a)
TOK=$(g t)

newtok() { head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
setpin()  { printf '%s' "$1" > "$PIN_FILE"; chmod 600 "$PIN_FILE"; }

# отладочный «медленный» запрос — держит load для скриншотов
[ "$ACTION" = "slow" ] && { sleep 2; ok '"s":1'; exit 0; }

[ "$ACTION" = "ping" ] && {
  PS=false; [ -f "$PIN_FILE" ] && PS=true
  printf '{"ok":1,"api":"1.0","model":"%s","ip":"%s","host":"%s","pin_set":%s}' \
    "$(cat /sys/firmware/devicetree/base/model 2>/dev/null | tr -d '\0')" \
    "$(ip -4 -o addr show wlan0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)" \
    "$(cat /etc/hostname 2>/dev/null)" "$PS"
  exit 0
}

# --- вход: с PIN или без него (PIN необязателен) ---
if [ "$ACTION" = "auth" ]; then
  if [ -f "$PIN_FILE" ]; then
    PIN=$(g pin)
    [ "$(cat "$PIN_FILE")" = "$PIN" ] || { err "bad_pin"; exit 0; }
  fi
  TOK=$(newtok); printf '%s' "$TOK" > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"
  ok "\"token\":\"$TOK\""; exit 0
fi

# --- поставить PIN, когда его ещё нет (первый вход) ---
if [ "$ACTION" = "setup" ]; then
  [ -f "$PIN_FILE" ] && { err "pin_exists"; exit 0; }
  PIN=$(g pin)
  [ ${#PIN} -ge 4 ] || { err "pin_too_short"; exit 0; }
  setpin "$PIN"
  TOK=$(newtok); printf '%s' "$TOK" > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"
  ok "\"token\":\"$TOK\""; exit 0
fi

# --- PIN включён → без токена дальше не пускаем ---
if [ -f "$PIN_FILE" ]; then
  [ -n "$TOK" ] && [ -f "$TOKEN_FILE" ] && [ "$(cat "$TOKEN_FILE")" = "$TOK" ] || {
    err "unauthorized"; exit 0; }
fi

case "$ACTION" in

# --- смена PIN ---
pin.set)
  [ -f "$PIN_FILE" ] || { err "pin_not_set"; exit 0; }
  OLD=$(g old); NEW=$(g new)
  [ "$(cat "$PIN_FILE")" = "$OLD" ] || { err "bad_pin"; exit 0; }
  [ ${#NEW} -ge 4 ] || { err "pin_too_short"; exit 0; }
  setpin "$NEW"
  ok '"changed":1';;

# --- отключить PIN: панель снова открыта для домашней сети ---
pin.clear)
  [ -f "$PIN_FILE" ] || { err "pin_not_set"; exit 0; }
  OLD=$(g old)
  [ "$(cat "$PIN_FILE")" = "$OLD" ] || { err "bad_pin"; exit 0; }
  rm -f "$PIN_FILE" "$TOKEN_FILE"
  ok '"cleared":1';;

# ---------- LED ----------
led.get)
  printf '{"ok":1,"zones":['
  i=0
  for z in 1 2 3; do
    r=$(cat /sys/class/leds/micro:red:ring$z/brightness 2>/dev/null || echo 0)
    gg=$(cat /sys/class/leds/micro:green:ring$z/brightness 2>/dev/null || echo 0)
    b=$(cat /sys/class/leds/micro:blue:ring$z/brightness 2>/dev/null || echo 0)
    [ $i -gt 0 ] && printf ','
    printf '{"zone":%d,"r":%d,"g":%d,"b":%d}' "$z" "$r" "$gg" "$b"
    i=$((i+1))
  done
  printf ']}';;

led.set)
  HEX=$(g hex); ZONE=$(g zone); GR=$(g r); GG=$(g g); GB=$(g b)
  # hex -> r g b  (без bash-ism: busybox ash)
  if [ -n "$HEX" ]; then
    H=$(echo "$HEX" | sed 's/#//')
    case ${#H} in 3) H=$(echo "$H" | sed 's/./&\&/g');; esac
    GR=$(printf '%d' 0x$(echo "$H" | cut -c1-2) 2>/dev/null || echo 0)
    GG=$(printf '%d' 0x$(echo "$H" | cut -c3-4) 2>/dev/null || echo 0)
    GB=$(printf '%d' 0x$(echo "$H" | cut -c5-6) 2>/dev/null || echo 0)
    HEX=$(echo "$H" | cut -c1-6)
  fi
  [ -n "$ZONE" ] || ZONE=all
  case "$ZONE" in
    all) ZONES="1 2 3";;
    *)   ZONES="$ZONE";;
  esac
  for z in $ZONES; do
    for c in red green blue; do
      case $c in
        red) v=$GR;; green) v=$GG;; blue) v=$GB;;
      esac
      echo "$v" > /sys/class/leds/micro:$c:ring$z/brightness 2>/dev/null
    done
  done
  ok "\"zone\":\"$ZONE\",\"hex\":\"#$HEX\"";;

led.off)
  for z in 1 2 3; do for c in red green blue; do
    echo 0 > /sys/class/leds/micro:$c:ring$z/brightness 2>/dev/null
  done; done
  ok '"off":1';;

# ---------- LED-анимации прошивки (/system/vendor/quasar/ledpatterns/*.led) ----------
led.patterns)
  printf '{"ok":1,"patterns":['
  i=0
  for f in /system/vendor/quasar/ledpatterns/*.led; do
    [ -f "$f" ] || continue
    n=${f##*/}; n=${n%.led}
    [ $i -gt 0 ] && printf ','
    printf '"%s"' "$n"
    i=$((i+1))
  done
  run=0
  [ -f "$BASE/led.pid" ] && kill -0 "$(cat "$BASE/led.pid")" 2>/dev/null && run=1
  printf '],"playing":%s}' "$run";;

led.play)
  P=$(g p)
  case "$P" in ''|*/*|*..*|*.*) err "bad_name"; exit 0;; esac
  F=/system/vendor/quasar/ledpatterns/$P.led
  [ -f "$F" ] || { err "no_pattern"; exit 0; }
  N=$(grep -cE '^[0-9a-fA-F]{6}[[:space:]]' "$F" 2>/dev/null); N=${N:-0}
  [ "$N" -gt 0 ] || { err "no_frames"; exit 0; }   # gradient-only (timer и т.п.) не играем
  if [ -f "$BASE/led.pid" ]; then
    kill "$(cat "$BASE/led.pid")" 2>/dev/null; rm -f "$BASE/led.pid"; sleep 1
  fi
  nohup sh -c '
    F=$1
    setz(){ echo $((0x$(echo "$2"|cut -c1-2))) > /sys/class/leds/micro:red:ring$1/brightness
            echo $((0x$(echo "$2"|cut -c3-4))) > /sys/class/leds/micro:green:ring$1/brightness
            echo $((0x$(echo "$2"|cut -c5-6))) > /sys/class/leds/micro:blue:ring$1/brightness; }
    while :; do
      loop=0
      while IFS= read -r ln; do
        set -- $ln
        [ "$1" = loop ] && { loop=1; continue; }
        [ $# -eq 4 ] || continue
        [ ${#1} -eq 6 ] && [ ${#2} -eq 6 ] && [ ${#3} -eq 6 ] || continue
        case "$1$2$3" in *[!0-9a-fA-F]*) continue;; esac
        case "$4" in *[!0-9]*) continue;; esac
        setz 1 "$1"; setz 2 "$2"; setz 3 "$3"
        usleep $((${4}*1000))
      done < "$F"
      [ "$loop" = 1 ] || break
    done
  ' sh "$F" >"$LOGDIR/led.log" 2>&1 &
  echo $! > "$BASE/led.pid"
  sleep 1
  kill -0 "$(cat "$BASE/led.pid")" 2>/dev/null || { rm -f "$BASE/led.pid"; err "player_failed"; exit 0; }
  ok "\"pattern\":\"$P\",\"frames\":$N";;

led.stop)
  st=0
  if [ -f "$BASE/led.pid" ]; then
    kill "$(cat "$BASE/led.pid")" 2>/dev/null && st=1
    rm -f "$BASE/led.pid"
  fi
  ok "\"stopped\":$st";;

# ---------- СИСТЕМА ----------
sys.info)
  UPT=$(cut -d' ' -f1 /proc/uptime)
  LOAD=$(cut -d' ' -f1-3 /proc/loadavg)
  MEMF=$(grep -E 'MemTotal|MemAvailable' /proc/meminfo | awk '{gsub(":","",$1); printf "%s=%s ", $1, $2}')
  DS=$(df -k /data | tail -1)
  printf '{"ok":1,"uptime":%.0f,"load":"%s","mem":"%s","disk":"%s","root":"%s","shell":"%s","adb":%s,"ssh":%s,"ota_off":%s}' \
    "$UPT" "$LOAD" "$MEMF" "$(je "$DS")" "$(id -u)" \
    "$(awk -F: '$1=="root"{print $7}' /etc/passwd)" \
    "$(netstat -lnt 2>/dev/null | grep -q ':5555' && echo true || echo false)" \
    "$(pidof dropbear >/dev/null && echo true || echo false)" \
    "$(grep -c updatesd /system/vendor/quasar/launch.json >/dev/null 2>&1 && echo false || echo true)";;

sys.reboot)
  ok '"rebooting":1'; (sleep 1; reboot) >/dev/null 2>&1 &;;

sys.ports)
  run netstat -lnt 2>/dev/null || run ss -lnt;;

# ---------- YSE ----------
yse.list)   run yse list;;
yse.update) run yse update;;
yse.search) q=$(g q); run yse search "$q";;
yse.install)
  p=$(g p)
  nohup sh -c "yse install $p > $YSE_LOG 2>&1" >/dev/null 2>&1 &
  ok "\"started\":1,\"pkg\":\"$(je "$p")\"";;
yse.remove)
  p=$(g p)
  nohup sh -c "yse remove $p > $YSE_LOG 2>&1" >/dev/null 2>&1 &
  ok "\"started\":1";;
yse.log)    run tail -n 200 "$YSE_LOG";;

# ---------- ЗВУКИ ----------
sound.list)
  printf '{"ok":1,"files":['
  i=0
  for f in /data/sounds/*; do
    [ -e "$f" ] || continue
    [ $i -gt 0 ] && printf ','
    printf '"%s"' "$(je "$(basename "$f")")"; i=$((i+1))
  done
  printf ']}';;

sound.play)
  SRC=$(g f); URL=$(g u)
  if [ -n "$URL" ]; then
    IN="souphttpsrc location=$URL ! decodebin"
    SRC=$URL
  else
    IN="filesrc location=/data/sounds/$SRC ! decodebin"
  fi
  # свой pid — гасим только СВОЁ воспроизведение, maind Алисы не трогаем
  nohup sh -c "cd /system/vendor/quasar && LD_LIBRARY_PATH=/system/vendor/quasar:libs exec ./maind --gst-launch '$IN ! audioconvert ! audioresample ! alsasink'" >"$LOGDIR/sound.log" 2>&1 &
  echo $! > "$BASE/sound.pid"
  ok "\"playing\":\"$(je "$SRC")\"";;

sound.stop)
  if [ -f "$BASE/sound.pid" ]; then
    kill "$(cat "$BASE/sound.pid")" 2>/dev/null && ST=1 || ST=0
    rm -f "$BASE/sound.pid"
    ok "\"stopped\":$ST"
  else
    err "nothing_playing"
  fi;;
sound.vol)  v=$(g v); run amixer -M set Master "${v}%";;

# --- чайм при включении (S98chime по wiki) ---
chime.get)
  [ -f /etc/init.d/S98chime ] && ok '"on":1' || ok '"on":0';;

chime.set)
  on=$(g on)
  mount -o remount,rw / 2>/dev/null
  if [ "$on" = "1" ]; then
    printf '%s\n' '#!/bin/sh' \
      '[ "$1" = start ] || exit 0' \
      'cd /system/vendor/quasar' \
      'LD_LIBRARY_PATH=/system/vendor/quasar:libs ./maind --gst-launch \' \
      '  "filesrc location=/data/sounds/chime.mp3 ! decodebin ! audioconvert ! audioresample ! alsasink" >/dev/null 2>&1 &' \
      > /etc/init.d/S98chime
    chmod +x /etc/init.d/S98chime
    RES=1
  else
    rm -f /etc/init.d/S98chime
    RES=0
  fi
  sync; mount -o remount,ro / 2>/dev/null
  ok "\"on\":$RES";;

# ---------- USB ----------
usb.status)
  printf '{"ok":1,"usb":['
  i=0
  for d in /sys/bus/usb/devices/*; do
    n=$(basename "$d")
    echo "$n" | grep -q ':' && continue
    [ -e "$d/product" ] || continue
    [ $i -gt 0 ] && printf ','
    printf '"%s"' "$(je "$n $(cat "$d/product" 2>/dev/null)")"; i=$((i+1))
  done
  printf '],"disks":['
  i=0
  for m in /tmp/usb/*; do
    [ -d "$m" ] || continue
    [ $i -gt 0 ] && printf ','
    printf '"%s"' "$(je "$m")"; i=$((i+1))
  done
  printf '],"cards":"%s"}' "$(je "$(cat /proc/asound/cards 2>/dev/null)")";;
# ---------- USB Host (OTG) ----------
otg.status)
  inst=0; [ -x /data/otg/otg-host.sh ] && inst=1
  dis=0;  [ -e /data/otg/disable ] && dis=1
  pend=0; [ -e /data/otg/boot-pending ] && pend=1
  host=0
  v=$(devmem 0xffe09080 32 2>/dev/null)          # usb_r0: бит 31 u2d_act — 0 = host (xHCI)
  [ -n "$v" ] && [ $(( v & 0x80000000 )) -eq 0 ] && host=1
  mods=$(lsmod 2>/dev/null | awk 'NR>1{print $1}')
  n=0
  for m in sd_mod usb-storage uas usbnet r8152 snd-usb-audio; do
    echo "$mods" | grep -qx "$m" && n=$((n+1))
  done
  disks=$(ls -d /tmp/usb/* 2>/dev/null | wc -l)
  log=$(tail -n 40 /data/otg/last.log 2>/dev/null)
  ok "\"installed\":$inst,\"host\":$host,\"auto\":$((1-dis)),\"pending\":$pend,\"mods\":$n,\"disks\":$disks,\"reg\":\"$v\",\"log\":\"$(je "$log")\"";;
otg.start)
  [ -x /data/otg/otg-host.sh ] || err "otg_not_installed"
  run sh -c '/data/otg/otg-host.sh; /data/otg/usb-mount.sh';;   # рантайм, перезагрузка не нужна
otg.auto)   # auto=1 — включать OTG при старте, 0 — отключить
  a=$(g auto)
  if [ "$a" = "1" ]; then rm -f /data/otg/disable; r=1; else touch /data/otg/disable; r=0; fi
  sync; ok "\"auto\":$r";;
otg.log)    [ -f /data/otg/last.log ] && run tail -n 60 /data/otg/last.log || err "no_log";;

usb.mount)  [ -x /data/otg/usb-mount.sh ] && run /data/otg/usb-mount.sh || err "otg_not_installed";;
usb.umount) [ -x /data/otg/usb-mount.sh ] && run /data/otg/usb-mount.sh -u || err "otg_not_installed";;
usb.route)  to=$(g to); [ -x /data/otg/audio-route.sh ] && run /data/otg/audio-route.sh "$to" || err "otg_not_installed";;

# ---------- ЛОГИ ----------
log.dmesg)  run sh -c 'dmesg | tail -n 150';;
log.tail)
  f=$(g f)
  case "$f" in
    api) run tail -n 200 "$LOGDIR/access.log";;
    yse) run tail -n 200 "$YSE_LOG";;
    *)   run tail -n 100 /var/log/messages 2>/dev/null;;
  esac;;

# ---------- КОНСОЛЬ ----------
shell)
  c=$(g c)
  [ -n "$c" ] || { err "empty"; exit 0; }
  run sh -c "$c";;

*) err "unknown_action: $ACTION";;
esac
echo ""
