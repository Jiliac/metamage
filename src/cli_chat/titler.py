"""Session and tool titling utilities using small models."""

import re
import json
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
            self._ensure_toolcall_columns()
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

    def set_titles(
        self,
        session_id: str,
        provider: str,
        user_text: str,
        assistant_text: str,
    ) -> Optional[str]:
        """Set session title and query titles for query_database tool calls."""
        title = self.maybe_set_session_title(
            session_id, provider, user_text, assistant_text
        )
        try:
            self.set_query_titles(session_id, provider)
        except Exception as e:
            print(f"❌ Error setting query titles: {e}")
        return title

    def set_query_titles(self, session_id: str, provider: str) -> None:
        """Fill title and column_names for query_database tool calls missing them."""
        sess = self.SessionFactory()
        try:
            from ..ops_model.chat_models import ToolCall, ChatMessage

            q = (
                sess.query(ToolCall)
                .join(ChatMessage, ChatMessage.id == ToolCall.message_id)
                .filter(
                    ChatMessage.session_id == session_id,
                    ToolCall.tool_name == "query_database",
                )
                .filter((ToolCall.title.is_(None)) | (ToolCall.column_names.is_(None)))
                .all()
            )

            if not q:
                return

            import json as _json

            for tc in q:
                # Extract SQL
                sql = None
                try:
                    if isinstance(tc.input_params, dict):
                        sql = tc.input_params.get("sql")
                    if not sql and isinstance(tc.input_params, str):
                        maybe = _json.loads(tc.input_params)
                        if isinstance(maybe, dict):
                            sql = maybe.get("sql")
                except Exception:
                    pass

                if not sql:
                    continue

                result_json = None
                if tc.tool_result and tc.tool_result.result_content is not None:
                    result_json = tc.tool_result.result_content

                # Build compact content preview for the model
                try:
                    result_preview = (
                        _json.dumps(result_json)[:4000]
                        if result_json is not None
                        else ""
                    )
                except Exception:
                    result_preview = str(result_json)[:4000]

                # Ask small model for title (call 1) and ordered column names (call 2)
                q_title = self._generate_query_title(provider, sql, result_preview)
                col_names = self._generate_query_columns(provider, sql, result_preview)

                updates = False

                if q_title and (tc.title is None or not str(tc.title).strip()):
                    tc.title = self._sanitize_title(q_title)
                    updates = True
                    print(f"🏷️  Query title set: {tc.title}")

                if col_names and (tc.column_names is None or not tc.column_names):
                    if isinstance(col_names, dict):
                        tc.column_names = col_names
                        updates = True
                        print(f"🧾 Column mapping set: {len(col_names)} columns")

                if updates:
                    sess.add(tc)

            sess.commit()
        except Exception:
            sess.rollback()
            raise
        finally:
            sess.close()

    def _generate_query_title(
        self, provider: str, sql: str, result_preview: str
    ) -> Optional[str]:
        """Use a small model to produce a concise title for a SQL query. Return plain string title."""
        prompt = (
            "Produce a concise title (3–8 words) for the following SQL query and result preview.\n"
            "- No quotes, no emojis, no trailing punctuation.\n"
            "- Title should describe the question the SQL answers.\n\n"
            "SQL:\n"
            f"{sql}\n\n"
            "Result content (sample/preview; may be truncated):\n"
            f"{result_preview}\n\n"
            "Return ONLY the title text."
        )
        try:
            if provider in ("claude", "opus"):
                llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=64)
            elif provider == "gpt5":
                llm = ChatOpenAI(model="gpt-5-nano", max_tokens=64)
            else:
                llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=64)
            resp = llm.invoke(prompt)
            text = str(getattr(resp, "content", resp)).strip()
            # Clean to one line and strip quotes
            title = self._sanitize_title(text)
            return title if title else None
        except Exception as e:
            print(f"❌ Query title generation failed: {e}")
            return None

    def _generate_query_columns(
        self, provider: str, sql: str, result_preview: str
    ) -> Optional[dict]:
        """Use a small model to infer column mapping from data keys to display names. Return dict[str, str]."""
        prompt = (
            "Given the SQL and the preview of the result JSON, output ONLY a JSON object mapping data keys to human-readable column names.\n"
            "- Do not include any text before or after the JSON object.\n"
            "- Keys should be the exact data keys from the first row of results.\n"
            "- Values should be human-readable, descriptive display names.\n"
            "- Use clear, concise names that users will easily understand.\n\n"
            "SQL:\n"
            f"{sql}\n\n"
            "Result content (sample/preview; may be truncated):\n"
            f"{result_preview}\n\n"
            'Example: if data has {{"archetype": "Zoo", "wins": 10, "losses": 5}}, output {{"archetype": "Archetype", "wins": "Wins", "losses": "Losses"}}'
        )
        try:
            if provider in ("claude", "opus"):
                llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=128)
            elif provider == "gpt5":
                llm = ChatOpenAI(model="gpt-5-nano", max_tokens=128)
            else:
                llm = ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=128)
            resp = llm.invoke(prompt)
            text = str(getattr(resp, "content", resp)).strip()
            # Parse JSON object strictly, then fallback
            try:
                data = json.loads(text)
            except Exception:
                import re as _re

                m = _re.search(r"\{.*\}", text, _re.DOTALL)
                data = json.loads(m.group(0)) if m else None
            if isinstance(data, dict):
                # Ensure all keys and values are strings
                mapping = {}
                for k, v in data.items():
                    key = str(k).strip()
                    val = str(v).strip()
                    if key and val:
                        mapping[key] = val
                return mapping if mapping else None
            return None
        except Exception as e:
            print(f"❌ Column names generation failed: {e}")
            return None

    def _ensure_toolcall_columns(self):
        """Ensure tool_calls.title and tool_calls.column_names exist (SQLite/Postgres safe)."""
        sess = self.SessionFactory()
        try:
            engine = sess.get_bind()
            insp = inspect(engine)
            if "tool_calls" not in insp.get_table_names():
                return
            cols = [c["name"] for c in insp.get_columns("tool_calls")]
            stmts = []
            if "title" not in cols:
                stmts.append("ALTER TABLE tool_calls ADD COLUMN title VARCHAR(200)")
            if "column_names" not in cols:
                if engine.dialect.name == "postgresql":
                    stmts.append("ALTER TABLE tool_calls ADD COLUMN column_names JSONB")
                else:
                    stmts.append("ALTER TABLE tool_calls ADD COLUMN column_names TEXT")
            if stmts:
                with engine.begin() as conn:
                    for sql in stmts:
                        conn.execute(text(sql))
        finally:
            sess.close()

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
