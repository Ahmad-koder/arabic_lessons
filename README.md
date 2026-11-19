# Уроки арабского: бот + Mini App для Telegram

- `webapp/` — Mini App: статический сайт без сборки (HTML + JS + CSS). Уроки лежат в `webapp/data/lessons.json`. Прогресс ученика сохраняется в Telegram CloudStorage, отдельная база не нужна.
- `bot/` — бот на aiogram 3. Отвечает на `/start` и `/lessons` кнопками, которые открывают Mini App, и ставит кнопку «Уроки» в меню чата. Если задан `CHANNEL_ID`, пускает только подписчиков канала.

## Запуск

1. **Бот.** В @BotFather: `/newbot` → получите токен.
2. **Mini App на GitHub Pages.** Запушьте репозиторий на GitHub, затем Settings → Pages → Source: **GitHub Actions**. Workflow `.github/workflows/pages.yml` выложит папку `webapp/`. Адрес будет вида `https://ahmad-koder.github.io/arabic_lessons/`.
3. **Mini App в BotFather (необязательно, для ссылок `t.me/<bot>/<app>`).** `/newapp` → выберите бота → укажите адрес из шага 2.
4. **Запуск бота** на сервере:

   ```bash
   cp .env.example .env   # заполните BOT_TOKEN, WEBAPP_URL, при желании CHANNEL_ID
   python3 -m venv .venv && . .venv/bin/activate
   pip install -r bot/requirements.txt
   set -a && . ./.env && set +a
   python bot/main.py
   ```

   Чтобы бот проверял подписку, добавьте его администратором в канал (права можно не давать).

## Бот на сервере muhadis.com

Бот работает рядом с сайтом как systemd-служба `arabic-bot` от отдельного пользователя `arabicbot`, код в `/srv/arabic-bot`. Открытых портов не нужно: бот сам опрашивает Telegram.

Первая установка (одно SSH-подключение — на сервере лимит ufw):

```bash
ssh root@5.181.187.171
curl -fsSL https://raw.githubusercontent.com/Ahmad-koder/arabic_lessons/main/deploy/server-setup.sh | sh
nano /srv/arabic-bot/.env     # BOT_TOKEN, CHANNEL_ID
sh /srv/arabic-bot/deploy/server-setup.sh
```

Обновление после `git push`: `ssh root@5.181.187.171 sh /srv/arabic-bot/deploy/update.sh`.
Логи: `journalctl -u arabic-bot -f`.

## Ссылки на конкретный урок

- `https://t.me/<bot>?start=lesson_2` — бот пришлёт кнопку на урок 2.
- `https://t.me/<bot>/<app>?startapp=lesson_2` — Mini App сразу откроет урок 2 (нужен шаг 3).

Эти ссылки удобно ставить в посты канала под каждым уроком.

## Как добавить урок

Добавьте объект в массив `lessons` в `webapp/data/lessons.json` и запушьте. Pages обновится сам, бот перечитает список при перезапуске.

Блоки теории (`blocks`):

| type | поля | что это |
| --- | --- | --- |
| `p` | `text` | абзац |
| `h` | `text` | подзаголовок |
| `list` | `items` | маркированный список |
| `table` | `head`, `rows` | таблица |
| `note` | `text` | заметка на полях |

Упражнения (`exercises`):

- `choice` — `prompt`, `options` (общие варианты), `items: [{q, answer, explain?}]`, где `answer` — индекс правильного варианта;
- `reveal` — `prompt` и `answer`, ответ открывается кнопкой.

В текстах работает `**жирный**`, а арабские слова автоматически получают арабский шрифт и направление справа налево.

## Локальная проверка

```bash
cd webapp && python3 -m http.server 8000
```

Откройте http://localhost:8000 — вне Telegram приложение тоже работает, прогресс хранится в localStorage.
