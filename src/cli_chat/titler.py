"""Session and tool titling utilities using small models."""

import re
from typing import Optional

from sqlalchemy import inspect, text
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from ..ops_model.base import get_ops_session_factory
from ..ops_model.chat_models import ChatSession

TITLE_PROMPT = """You are to generate a very short, specific session title (3–7 words) based on the user question and the assistant's final answer.
- No quotes, no emojis, no trailing punctuation.
- Use concise, descriptive terms (deck names, matchup, time window).
Return title only.

User:
{user}

Assistant:
{assistant}
"""


class Titler:
    """Generates concise titles for sessions (and later, tools)."""

    def __init__(self):
        self.SessionFactory = get_ops_session_factory()
        # Ensure the title column exists for backwards-compatible DBs
        try:
            self._ensure_title_column()
        except Exception:
            # Non-fatal if we can't apply in-process migration
            pass

    def maybe_set_session_title(
        self,
        session_id: str,
        provider: str,
        user_text: str,
        assistant_text: str,
    ) -> Optional[str]:
        """Generate and persist a session title if not already set."""
        session = self.SessionFactory()
        try:
            chat_sess = session.query(ChatSession).filter_by(id=session_id).first()
            if not chat_sess:
                return None
            if chat_sess.title:
                return chat_sess.title  # Already set

            title = self._generate_title(provider, user_text, assistant_text)
            if not title:
                return None

            title = self._sanitize_title(title)
            if not title:
                return None

            chat_sess.title = title
            session.commit()
            print(f"🏷️  Set session title: {title}")
            return title
        except Exception as e:
            session.rollback()
            print(f"❌ Error setting session title: {e}")
            return None
        finally:
            session.close()

    def _generate_title(
        self, provider: str, user_text: str, assistant_text: str
    ) -> Optional[str]:
        prompt = TITLE_PROMPT.format(
            user=user_text[:2000], assistant=assistant_text[:4000]
        )

        try:
            if provider in ("claude", "opus"):
                llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=64)
            elif provider == "gpt5":
                llm = ChatOpenAI(model="gpt-5-nano", max_tokens=64)
            else:
                # Fallback to Anthropic small if unknown
                llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=64)

            resp = llm.invoke(prompt)
            if hasattr(resp, "content"):
                return str(resp.content).strip()
            return str(resp).strip()
        except Exception as e:
            print(f"❌ Title generation failed: {e}")
            return None

    def _sanitize_title(self, s: str) -> str:
        s = s.strip()
        # Remove surrounding quotes
        s = re.sub(r'^[\'"]|[\'"]$', "", s)
        # Remove non-ASCII control/emoji
        s = "".join(ch for ch in s if (31 < ord(ch) < 127))
        # Remove trailing punctuation or dashes
        s = re.sub(r"[ \t\-–—:]+$", "", s)
        # Clamp length
        return s[:200].strip()

    def _ensure_title_column(self):
        """Ensure chat_sessions.title exists (SQLite/Postgres compatible)."""
        sess = self.SessionFactory()
        try:
            engine = sess.get_bind()
            insp = inspect(engine)
            if "chat_sessions" in insp.get_table_names():
                cols = [c["name"] for c in insp.get_columns("chat_sessions")]
                if "title" not in cols:
                    with engine.begin() as conn:
                        conn.execute(
                            text(
                                "ALTER TABLE chat_sessions ADD COLUMN title VARCHAR(200)"
                            )
                        )
        finally:
            sess.close()
