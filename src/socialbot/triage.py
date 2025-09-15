import os
import json
import re
import logging
from typing import List, Tuple, Optional

from langchain_anthropic import ChatAnthropic

logger = logging.getLogger("socialbot.triage")

TRIAGE_PROMPT = """You are a strict gatekeeper deciding if a bot should reply to a Bluesky mention/reply about Magic: The Gathering tournament data.

Criteria (reply only if ALL are true):
- The latest user turn contains a clear question or request relevant to MTG tournament data (formats, archetypes, matchups, winrates, meta trends, cards, players, tournaments).
- The request is reasonably answerable with the available tools (no deckbuilding/sideboarding advice or general gameplay tips).
- Not spam/banter/greeting/compliment/emoji-only/link-only.
- Not abusive/offensive.

Output JSON only, no extra text:
{"answer": true|false, "reason": "short reason (<=100 chars)"}

Conversation (latest last):
{conversation}
"""

SCHEMA_RETRY_NOTE = "\n\nYour previous output did not match the required JSON schema. Output ONLY a single JSON object with keys 'answer' (boolean) and 'reason' (string <=100 chars). No extra text."


def _scrub(s: str) -> str:
    # Remove @handle.tld and generic @handle to reduce PII
    s = re.sub(r"@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}", "@user", s)
    s = re.sub(r"@\w+", "@user", s)
    return s.strip()


def _format_messages(messages: List[tuple]) -> str:
    # messages: List[("user"|"assistant", text)]
    lines = []
    for role, text in messages[-8:]:
        role_tag = "User" if role == "user" else "Assistant"
        lines.append(f"{role_tag}: {_scrub(text or '')}")
    return "\n".join(lines)


def _parse_json_object(text: str) -> Optional[dict]:
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None


async def should_answer_notification(
    notif,
    messages: List[tuple],
    provider: Optional[str] = "claude",
    max_retries: int = 2,
) -> Tuple[bool, str]:
    """
    Decide whether to answer the notification using a small model gate.
    Returns (ok_to_answer, reason).
    Fail-open: on persistent schema errors or unexpected exceptions, returns (True, reason).
    """
    # Env overrides
    if os.getenv("SOCIALBOT_TRIAGE", "1") == "0":
        return True, "triage disabled"
    if os.getenv("SOCIALBOT_FORCE_ANSWER", "0") == "1":
        return True, "forced by env"

    # Cheap heuristics
    latest_text = (messages[-1][1] if messages and len(messages[-1]) > 1 else "") or ""
    lt = latest_text.strip().lower()
    if not lt or len(lt) < 3:
        return False, "empty/too short"
    if re.fullmatch(r"https?://\S+", lt):
        return False, "link-only"
    if not any(ch.isalpha() for ch in lt):
        return False, "non-text"

    # Small LLM (Haiku)
    llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=64)
    base_prompt = TRIAGE_PROMPT.format(conversation=_format_messages(messages))

    last_text: Optional[str] = None
    for attempt in range(max_retries + 1):
        prompt = base_prompt if attempt == 0 else (base_prompt + SCHEMA_RETRY_NOTE)
        try:
            resp = llm.invoke(prompt)
            text = str(getattr(resp, "content", resp)).strip()
            last_text = text
            data = _parse_json_object(text)
            if not isinstance(data, dict):
                continue  # schema retry
            if "answer" not in data:
                continue  # schema retry
            answer = bool(data.get("answer"))
            reason = str(data.get("reason") or ("accepted" if answer else "rejected"))
            # Clamp reason len
            reason = reason[:100].strip()
            # Log refusal
            if not answer:
                logger.info(f"Triage refused: {reason}")
            return answer, reason
        except Exception as e:
            # Unexpected error -> try again; if exhausted, fail-open
            if attempt == max_retries:
                logger.warning(f"Triage unexpected error (fail-open): {e}")
                return True, f"triage error: {e}"
            continue

    # If all retries exhausted due to schema issues -> fail-open
    logger.warning(
        f"Triage schema parse failed after {max_retries + 1} attempts; last text: {last_text!r}"
    )
    return True, "triage schema failure (fail-open)"
