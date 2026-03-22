"""LLM client abstraction — supports Anthropic, OpenAI, or None."""
from dataclasses import dataclass


@dataclass
class LLMClient:
    provider: str  # "anthropic" | "openai" | "none"
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
        if self.provider == "openai":
            import openai
            client = openai.OpenAI(api_key=self.api_key)
            resp = client.chat.completions.create(
                model=self.model or "gpt-4o-mini",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        return ""
