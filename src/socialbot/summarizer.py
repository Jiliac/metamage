import os
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI


def _has_anthropic() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _has_openai() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def _small_llm(provider: Optional[str] = None):
    # Prefer Anthropic Haiku; fallback to OpenAI nano if requested/available
    if provider in ("claude", "opus") or (provider is None and _has_anthropic()):
        return ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=128)
    if provider == "gpt5" and _has_openai():
        return ChatOpenAI(model="gpt-5-nano", max_tokens=128)
    # Fallback to Anthropic if available, otherwise None (we'll hard-trim)
    return (
        ChatAnthropic(model="claude-3-5-haiku-20241022", max_tokens=128)
        if _has_anthropic()
        else None
    )


async def summarize(
    answer: str, provider: Optional[str] = None, limit: int = 250, max_retries: int = 2
) -> str:
    """
    Summarize to <= limit chars using a small model with retries.
    If model unavailable, return hard-trimmed text.
    """
    if len(answer) <= limit:
        return answer

    llm = _small_llm(provider)
    if llm is None:
        return answer[:limit].rstrip()

    attempt: Optional[str] = None
    base_prompt = (
        f"Rewrite the following answer in <= {limit} characters. Plain text only. "
        "Keep key numbers and the main conclusion. No new hashtags. "
        "If truncation is needed, prefer preserving the main conclusion.\n\n"
        "Answer:\n"
        f"{answer}"
    )

    for i in range(max_retries + 1):
        prompt = (
            base_prompt
            if attempt is None
            else (base_prompt + "\n\nPrevious attempt (too long):\n" + attempt)
        )
        try:
            resp = llm.invoke(prompt)
            text = str(getattr(resp, "content", resp)).strip()
            if len(text) <= limit:
                return text
            attempt = text
        except Exception:
            break

    # Last resort hard cap
    return (attempt or answer)[:limit].rstrip()
