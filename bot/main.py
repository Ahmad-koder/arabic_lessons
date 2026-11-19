"""Telegram-бот, который открывает Mini App с уроками арабского."""

import asyncio
import json
import logging
import os
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.enums import ChatMemberStatus
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("arabic-bot")

BOT_TOKEN = os.environ["BOT_TOKEN"]
# HTTPS-адрес Mini App, например https://ahmad-koder.github.io/arabic_lessons/
WEBAPP_URL = os.environ["WEBAPP_URL"].rstrip("/") + "/"
# Необязательно: @username или числовой id канала. Если задан, бот пускает только подписчиков.
CHANNEL_ID = os.environ.get("CHANNEL_ID", "").strip()

LESSONS_FILE = Path(__file__).resolve().parent.parent / "webapp" / "data" / "lessons.json"
LESSONS = json.loads(LESSONS_FILE.read_text(encoding="utf-8"))["lessons"]

MEMBER_STATUSES = {
    ChatMemberStatus.CREATOR,
    ChatMemberStatus.ADMINISTRATOR,
    ChatMemberStatus.MEMBER,
    ChatMemberStatus.RESTRICTED,
}

dp = Dispatcher()


def webapp_url(lesson_id: int | None = None) -> str:
    if lesson_id is None:
        return WEBAPP_URL
    return f"{WEBAPP_URL}#/lesson/{lesson_id}"


def open_button(text: str, lesson_id: int | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=text, web_app=WebAppInfo(url=webapp_url(lesson_id)))]]
    )


async def is_subscriber(bot: Bot, user_id: int) -> bool:
    if not CHANNEL_ID:
        return True
    try:
        member = await bot.get_chat_member(CHANNEL_ID, user_id)
    except Exception:  # бот не админ канала или канал не найден
        log.exception("Не удалось проверить подписку на %s", CHANNEL_ID)
        return False
    return member.status in MEMBER_STATUSES


async def deny(message: Message) -> None:
    await message.answer(
        f"Уроки доступны подписчикам канала {CHANNEL_ID}. Подпишитесь и нажмите /start ещё раз."
    )


@dp.message(CommandStart())
async def start(message: Message, command: CommandObject, bot: Bot) -> None:
    if not await is_subscriber(bot, message.from_user.id):
        await deny(message)
        return

    # t.me/<bot>?start=lesson_2 → сразу кнопка на урок 2
    lesson_id = None
    if command.args and command.args.startswith("lesson_"):
        tail = command.args.removeprefix("lesson_")
        if tail.isdigit():
            lesson_id = int(tail)

    await message.answer(
        "Ас-саляму алейкум! Здесь уроки арабского по видео канала: теория, таблицы и упражнения.\n\n"
        "Нажмите кнопку ниже, чтобы открыть уроки. Список — /lessons.",
        reply_markup=open_button("Открыть уроки" if lesson_id is None else f"Открыть урок {lesson_id}", lesson_id),
    )


@dp.message(Command("lessons"))
async def lessons(message: Message, bot: Bot) -> None:
    if not await is_subscriber(bot, message.from_user.id):
        await deny(message)
        return

    keyboard = [
        [InlineKeyboardButton(text=f"{l['id']}. {l['title']}", web_app=WebAppInfo(url=webapp_url(l["id"])))]
        for l in LESSONS
    ]
    await message.answer("Выберите урок:", reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard))


@dp.message(F.text)
async def fallback(message: Message) -> None:
    await message.answer("Откройте уроки кнопкой ниже или командой /lessons.", reply_markup=open_button("Открыть уроки"))


async def main() -> None:
    bot = Bot(BOT_TOKEN)
    # Кнопка «Уроки» слева от поля ввода во всех чатах с ботом
    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Уроки", web_app=WebAppInfo(url=WEBAPP_URL)))
    log.info("Бот запущен, Mini App: %s", WEBAPP_URL)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
