# Alice-App

Управление **Яндекс Станцией Лайт** с телефона: Android-приложение (WebView + Material Web)
и CGI-бэкенд, который живёт прямо на колонке.

```
┌─────────────┐   HTTP (Wi-Fi)   ┌──────────────────────────┐
│  Телефон    │ ───────────────► │ Колонка 192.168.1.20:8080│
│  APK        │   JSON, PIN →    │  lighttpd + api.sh (CGI)  │
│  (WebView)  │   токен          │  root, ADB, SSH, USB Host │
└─────────────┘                  └──────────────────────────┘
```

- **Бэкенд только на колонке** — телефон отдаёт команды, ничего не эмулирует.
- **Транспорт — HTTP**; Shizuku — запасной канал (консоль и ADB-команды на телефоне).
- Никакой разборки колонки: всё по сети (ADB `:5555`, SSH `:2222`, панель `:8080`).

## Возможности

| Вкладка | Что делает |
|---|---|
| **Свет** | палитра из текущей LED-подсветки, заливка цвета, яркость, погасить, **анимации прошивки** (33 паттерна `.led`: играть/стоп) |
| **USB** | статус USB Host (OTG), автозапуск, включить Host сейчас, лог, `usb.status`/смонтированные диски |
| **Пакеты (yse)** | список/поиск/установка/обновление/удаление пакетов, лог установки |
| **Звук** | список, воспроизведение, стоп, громкость, звук включения (chime) |
| **Система** | uptime/память/диск, root, ADB/SSH, OTA off, порты, reboot, dmesg, хвост логов |
| **Консоль** | команды с каналами **колонка** (`sh`) и **телефон (shizuku)**, пилюля `shizuku ✓/✗` |

Прочее: **PIN-код необязателен** — при первом входе приложение само спрашивает
«Добавить PIN-код для входа?», отказаться можно («Не сейчас»). Поставить, сменить
и отключить код — в «Система → Доступ к панели». Ещё: автопоиск колонки в сети
(или ручной IP), тёмная тема Material Web, навигация по 6 вкладкам.

## Структура репозитория

```
app/      Android-оболочка: WebView, мост window.Android, Shizuku (UserService.kt)
web/      интерфейс панели (index.html, app.js, styles.css, lib/, icons/) — источник истины
speaker/  бэкенд колонки: api.sh, install.sh, lighttpd.conf, S96alice
console/  .zshrc для красивой консоли на колонке (zsh + powerlevel10k)
gradle/   Gradle wrapper
.env.example  шаблон секретов (сам .env в git не идёт)
```

`app/src/main/assets/web/` **генерируется при сборке** таском `syncWebAssets`
(копирует `web/` → assets, удаляя устаревшее). Каталог в git не входит.

## Сборка APK

Требуется JDK 17, Android SDK (platform 36, build-tools), Gradle wrapper — внутри репо.

```bash
cp .env.example .env      # и заполнить: пароли keystore
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Подпись — своим ключом (`keystore/alice.jks`, **не публикуется**).
Пароли читаются из переменных окружения `ALICE_KS_*`, а при их отсутствии — из
корневого `.env`. Без ключа release собирается неподписанным.

### CI (GitHub Actions)

`.github/workflows/android.yml` гоняется на каждый push в `main`, на PR и по
тегу `v*`: дешёвые чеки (`sh -n speaker/*.sh`, `node --check web/app.js`),
`assembleRelease`, проверка подписи `apksigner`, APK — артефактом.

Подпись в CI — из GitHub Secrets:

```bash
gh secret set ALICE_KEYSTORE_B64 < <(base64 -w0 keystore/alice.jks)
gh secret set ALICE_KS_PASSWORD      # пароль keystore
gh secret set ALICE_KS_ALIAS         # alice
gh secret set ALICE_KS_KEY_PASSWORD  # пароль ключа, если отличается
```

Без секретов workflow собирает неподписанный APK, но **не падает**.
Релиз делается тегом:

```bash
git tag v1.1 && git push origin v1.1   # → GitHub Releases c Alice-App-1.1.apk
```

Установка на телефон:

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

Приложение можно открыть сразу на нужной странице (deep-link, удобно для отладки):

```bash
adb shell am start -n dev.bitplugg.aliceapp/.MainActivity \
  --es url 'http://192.168.1.20:8080/?t=<токен>&page=p-led'
```

## Установка бэкенда на колонку

```bash
sh speaker/install.sh 192.168.1.20
# → http://192.168.1.20:8080/
```

`install.sh` закинет `api.sh`, `lighttpd.conf`, автозапуск `S96alice` и веб-панель,
потом перезапустит lighttpd. Вручную (без install.sh):

```bash
ssh alice 'cat > /data/opt/alice/cgi-bin/api.sh' < speaker/api.sh
scp speaker/web/*   # или tar cf - | ssh alice 'tar xf -'
```

Тонкости прошивки, о которых помнит `install.sh`: busybox `tar` **без `-z`**,
на Dropbear **нет scp/sftp**, `/data` — symlink на `/bkupgrade/data`,
в `PATH` колонки нет `/data/opt/bin`.

## API колонки

GET/POST `/cgi-bin/api.sh?a=<действие>&t=<токен>[&параметры]`, ответ — JSON.

**PIN необязателен** (флаг `pin_set` в ответе `a=ping`):

- **PIN отключён** — токен не нужен: панель открыта для твоей сети;
- **PIN включён** — `a=auth&pin=…` выдаёт токен, все действия без него
  (кроме `ping`/`slow`/`auth`/`setup`) отвечают `{"error":"unauthorized"}`.

| Группа | Действия |
|---|---|
| Доступ | `ping`, `setup` (поставить PIN, пока его нет), `auth`, `pin.set` (смена), `pin.clear` (отключить) |
| Светодиоды | `led.get`, `led.set`, `led.off`, `led.patterns`, `led.play`, `led.stop` |
| Система | `sys.info`, `sys.ports`, `sys.reboot` |
| Пакеты yse | `yse.list`, `yse.search`, `yse.install`, `yse.update`, `yse.remove`, `yse.log` |
| Звук | `sound.list`, `sound.play`, `sound.stop`, `sound.vol`, `chime.get`, `chime.set` |
| USB / OTG | `usb.status`, `usb.mount`, `usb.umount`, `usb.route`, `otg.status`, `otg.start`, `otg.auto`, `otg.log` |
| Логи | `log.dmesg`, `log.tail` |
| Прочее | `shell`, `slow` (заглушка долгих операций) |

Пример:

```bash
curl 'http://192.168.1.20:8080/cgi-bin/api.sh?a=led.play&p=alice_listening&t=<токен>'
# {"ok":1,"pattern":"alice_listening","frames":40}
```

### Анимации прошивки (`.led`)

Формат описан в рецепте [led.md](https://github.com/Marker284/yandex-station-extended/blob/main/docs/recipes/led.md):
плеер в `api.sh` читает готовые паттерны `.led` из прошивки и отдаёт кадры в LED-кольца.
Плеер однопоточный: `led.stop` перед следующим `led.play`. Алиса может сбрасывать
кольца в 0 — это норма, повтори команду.

### USB Host (OTG)

Рецепт [usb-host.md](https://github.com/Marker284/yandex-station-extended/blob/main/docs/recipes/usb-host.md):
14 модулей кладутся в `/data/otg-src`, ставятся `sh /data/otg-src/otg/install.sh`
(→ `/data/otg/`, юнит `S97otg-host` + mdev-правило). Переключение порта
`0x8000006A → 0x0000006A`, `xhci bind` — и колонка становится USB-host'ом.

- статус: `curl '.../api.sh?a=otg.status&t=<токен>'`
- автозапуск выключить: `a=otg.auto&v=0` и перезагрузка (или `touch /data/otg/disable` на колонке)
- после перезагрузки поднимается сам (проверено)

## Shizuku (запасной канал)

Установи [Shizuku](https://shizuku.rikka.app/), запусти `adb shell sh /sdcard/Android/data/moe.shizuku.privileged.api/files/start.sh`
и выдай приложению разрешение. В панели появится пилюля `shizuku ✓`,
заработает канал **«телефон (shizuku)»** в консоли (команды выполняются на самом телефоне).

Без Shizuku всё работает: используется только HTTP-канал на колонку.

## Безопасность

- **`.env`** (PIN, Wi-Fi, пароли подписи) — в `.gitignore`; см. `.env.example`.
- **`keystore/alice.jks`** — ключ подписи APK, в git не идёт.
- **`local.properties`**, `.gradle/`, `build/`, `app/src/main/assets/web/`, `*.apk` — тоже в `.gitignore`.
- **PIN необязателен**: без него панель — и действие `shell` — открыты для всей
  домашней сети. Если к Wi-Fi подключаются чужие, поставь код в
  «Система → Доступ к панели» (при включённом PIN панель закрыта сессионным токеном).
- CGI отдаёт `Access-Control-Allow-Origin: *`, поэтому доступ к `:8080` в твоей
  сети = доступ к колонке; порт наружу не открывай.

## Известные ограничения

- AirPlay-пакета в репозитории пока нет (в вики — «идея, не реализовано»).
- Своей LLM вместо Алисы нет.
- Реальная флешка/хаб через OTG проверены только на уровне переключения порта
  (`disks:0`, устройств пока не подключалось).

## Лицензия

Лицензия не назначена — все права у автора. Форк и доработка для себя приветствуются;
публикация производных работ — по согласованию.
