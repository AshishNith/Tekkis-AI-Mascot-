import type { FunctionDeclaration } from "@google/genai";

/** The browser actions Gemini may call. Executed by the background worker and the page's content script. */
export const BROWSER_TOOLS: FunctionDeclaration[] = [
  {
    name: "read_page",
    description:
      "Look at the page the user is on. Returns its URL, title, a text excerpt and a numbered list of clickable/typable elements. Call this before click or type_text, and again after the page changes.",
  },
  {
    name: "look_at_screen",
    description:
      "Take a screenshot of what the user is looking at right now and look at it. Use it when they ask about what is on their screen, or for things read_page can't show: images, charts, videos, layout, colours. After calling it, describe or answer from what you see.",
  },
  {
    name: "click",
    description: "Click an element by the id from the latest read_page.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Element id from read_page" },
        confirmed: { type: "boolean", description: "True only after the user said yes to a risky action (buying, sending, deleting...)" },
      },
      required: ["id"],
    },
  },
  {
    name: "type_text",
    description: "Type text into an input, search box or text area by id. Never use for passwords or card numbers.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Element id from read_page" },
        text: { type: "string" },
        submit: { type: "boolean", description: "Press Enter / submit the form afterwards" },
      },
      required: ["id", "text"],
    },
  },
  {
    name: "fill_form",
    description:
      "Fill in several form fields at once (text boxes, text areas, dropdowns). Faster than type_text one by one. Does not submit the form and skips password/payment fields.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer" }, text: { type: "string", description: "Text to type, or the option to pick in a dropdown" } },
            required: ["id", "text"],
          },
        },
      },
      required: ["fields"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the page.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "top", "bottom"] },
        amount: { type: "number", description: "Screens to scroll for up/down (default 1)" },
      },
      required: ["direction"],
    },
  },
  {
    name: "go_to",
    description: "Open a web address (http or https) in the current tab.",
    parametersJsonSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "web_search",
    description: "Search Google for something in the current tab.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "open_tab",
    description: "Open a web address in a new tab and switch to it.",
    parametersJsonSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  { name: "go_back", description: "Go back one page in the current tab." },
];
