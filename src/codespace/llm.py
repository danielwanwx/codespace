"""LLM client abstraction — supports Anthropic, OpenAI, MiniMax, or None."""
from dataclasses import dataclass


# OpenAI-compatible providers: (provider_name -> (base_url, default_model))
_OPENAI_COMPAT_PROVIDERS: dict[str, tuple[str, str]] = {
    "minimax": ("https://api.minimax.chat/v1", "MiniMax-M1"),
    "minimax-global": ("https://api.minimaxi.chat/v1", "MiniMax-M1"),
    "deepseek": ("https://api.deepseek.com/v1", "deepseek-chat"),
}

_MAX_RETRIES = 3
_RETRY_DELAY = 2  # seconds


@dataclass
class LLMClient:
    provider: str  # "anthropic" | "openai" | "minimax" | "none" | etc.
    api_key: str = ""
    model: str = ""

    def complete(self, prompt: str, max_tokens: int = 100) -> str:
        if self.provider == "none":
            return ""
        if self.provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)
            resp = client.messages.create(
                model=self.model or "claude-sonnet-4-5-20250929",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text
        # OpenAI or any OpenAI-compatible provider
        if self.provider in _OPENAI_COMPAT_PROVIDERS:
            base_url, default_model = _OPENAI_COMPAT_PROVIDERS[self.provider]
            return self._openai_complete(prompt, max_tokens, base_url, default_model)
        if self.provider == "openai":
            return self._openai_complete(prompt, max_tokens, None, "gpt-4o-mini")
        return ""

    def _openai_complete(
        self, prompt: str, max_tokens: int,
        base_url: str | None, default_model: str,
    ) -> str:
        import time
        import openai
        kwargs: dict = {"api_key": self.api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = openai.OpenAI(**kwargs)
        for attempt in range(_MAX_RETRIES):
            try:
                resp = client.chat.completions.create(
                    model=self.model or default_model,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}],
                )
                return resp.choices[0].message.content or ""
            except openai.RateLimitError:
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(_RETRY_DELAY * (attempt + 1))
                else:
                    raise
        return ""
