import type { AIProvider } from "./AIProvider.interface.js";
import { MockAIProvider } from "./providers/MockAIProvider.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { ENV } from "../config/env.js";
import logger from "../utils/logger.js";

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (providerInstance) return providerInstance;

  const providerName = ENV.AI_PROVIDER;

  switch (providerName) {
    case "openai":
      if (!ENV.AI_API_KEY) {
        logger.warn(
          "AI_PROVIDER=openai but AI_API_KEY is not set — falling back to mock"
        );
        providerInstance = new MockAIProvider();
      } else {
        providerInstance = new OpenAIProvider();
      }
      break;

    case "gemini":
      logger.warn("Gemini provider not fully implemented — using mock");
      providerInstance = new MockAIProvider();
      break;

    case "mock":
    default:
      providerInstance = new MockAIProvider();
      break;
  }

  logger.info(
    {
      provider: providerInstance.getProviderName(),
      model: providerInstance.getModelName(),
    },
    "AI provider initialized"
  );

  return providerInstance;
}

/** Reset the singleton (useful for testing) */
export function resetAIProvider(): void {
  providerInstance = null;
}
