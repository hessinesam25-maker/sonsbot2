export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Official DeepSeek API Server Integration.
 * Server-only module. Never exposes API key to client.
 */
export async function generateDeepSeekReply(
  messages: DeepSeekChatMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }
): Promise<DeepSeekResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    return {
      success: false,
      error: 'DEEPSEEK_API_KEY MISSING',
    };
  }

  // Official default model for low-latency factual restaurant customer support
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const maxTokens = options?.maxTokens ?? 150;
  const temperature = options?.temperature ?? 0.3; // Low temperature for high factual precision
  const timeoutMs = options?.timeoutMs ?? 8000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        // Explicit non-thinking mode for ultra-low latency & factual responses
        thinking: { type: 'disabled' },
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Failed to read response body');
      return {
        success: false,
        error: `DeepSeek API returned HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const replyText = data?.choices?.[0]?.message?.content?.trim();

    if (!replyText) {
      return {
        success: false,
        error: 'DeepSeek returned empty choice content',
      };
    }

    return {
      success: true,
      content: replyText,
      usage: {
        promptTokens: data?.usage?.prompt_tokens || 0,
        completionTokens: data?.usage?.completion_tokens || 0,
        totalTokens: data?.usage?.total_tokens || 0,
      },
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: `DeepSeek request timed out after ${timeoutMs}ms`,
      };
    }
    return {
      success: false,
      error: `DeepSeek fetch exception: ${err.message || 'Unknown network error'}`,
    };
  }
}
