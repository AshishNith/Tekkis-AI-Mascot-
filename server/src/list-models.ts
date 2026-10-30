// Lists the models this API key can use with the Live API (bidiGenerateContent).
import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

if (!config.geminiApiKey) {
  console.error("Set GEMINI_API_KEY in .env first.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const pager = await ai.models.list({ config: { pageSize: 100 } });
for await (const model of pager) {
  if (model.supportedActions?.includes("bidiGenerateContent")) {
    console.log(model.name?.replace(/^models\//, ""), "-", model.displayName);
  }
}
