# Alice-App v2

Панель управления **Яндекс Станцией Лайт** — полностью нативное Android-приложение (Jetpack Compose, Material 3 Expressive / Material You). Вторая версия: отказ от web-панели, живой главный экран «колонка перед лицом», виджеты, журнал событий и автореобновление.

## Возможности

- **Свет (RGB)** — главный экран с превью Станции Лайт (3 LED-кольца меняются в реальном времени), палитра, hue-слайдер, яркость, выбор зоны (все / кольцо 1–3), «залить» / «погасить», анимации прошивки (`ledpatterns/*.led`).
- **Пакеты** — поиск/установка/удаление через `yse`, журнал установки.
- **Звук** — файлы `/data/sounds`, потоки (URL), громкость, чайм при включении.
- **USB / OTG** — статус host, автозапуск, включение OTG-режима, диски, звуковые карты, маршрут звука.
- **Система** — аптайм, память, диск, root, ADB/SSH, OTA; логи dmesg/yse/api; reboot.
- **Консоль** — команды на колонку (CGI) и на телефон (Shizuku, uid shell).
- **Debug · RGB** — поштучная диагностика LED-каналов (`rgb.diag`, `rgb.test`).
- **Настройки** — тема (системная/светлая/тёмная), экспорт/импорт конфига, проверка обновлений, журнал событий.
- **Журнал событий** — опрос колонки: панель 5 с, фон (WorkManager) 15 мин; события: онлайн/офлайн, USB-диски, пакеты yse → локальные уведомления.
- **Виджеты (Glance)** — LED-виджет (палитра + «погасить»), громкость, кнопки-ссылки на вкладки.
- **Автообновление** — проверка GitHub Releases, скачивание через DownloadManager, системный установщик.
- Онбординг (приветствие → IP → PIN), PIN **необязателен**, RU/EN, тёмная/светлая/системная тема.

## Структура

```
app/            MainActivity, Vm, Repo (DataStore), экраны, Shizuku, обновления, EventWorker
core/api/       SpeakerApi — HTTP-клиент CGI api.sh (JSON)
core/design/    Палитра из seed через OKLCH → material3 ColorScheme, тема, утилиты цвета
widget/         Glance-виджеты (LED / громкость / навигация)
speaker/        Бэкенд на колонке: lighttpd.conf, CGI api.sh (v1.2), install.sh, S96alice
keystore/       alice2.jks (ключ подписи; не в git — CI берёт из Secrets)
```

## Установка бэкенда на колонку

SSH на Станцию Лайт (порт 2222), затем:

```sh
sh speaker/install.sh
mkdir -p /data/opt/alice/cgi-bin && cp speaker/api.sh /data/opt/alice/cgi-bin/
cp speaker/lighttpd.conf speaker/S96alice /data/opt/alice/
/data/opt/alice/S96alice start   # lighttpd на порту 8080
```

API: `http://<ip-колонки>:8080/cgi-bin/api.sh?a=ping` — остальные действия `led.get/set/off`, `led.patterns/play/stop`, `yse.*`, `sound.*`, `chime.*`, `usb.*`, `otg.*`, `sys.*`, `log.*`, `shell`, `events.check/tail/clear`, `rgb.diag/test/stop`.

## Сборка

```sh
./gradlew assembleRelease
```

Подпись: keystore `keystore/alice2.jks`, пароли из `.env` (`ALICE2_KS_PASSWORD`, `ALICE2_KS_ALIAS`, `ALICE2_KS_KEY_PASSWORD`) или env CI. Релизы — по тегу `v*` (GitHub Actions).

## Обновление с v1

- Название приложения то же, applicationId новый (`dev.bitplugg.aliceapp.v2`) — v1 и v2 живут рядом.
- API панели обратно совместимо; новые действия `events.*` и `rgb.*` требуют свежего `api.sh` с колонки.
