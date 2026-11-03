import type { FunctionDeclaration } from "@google/genai";

/** The browser actions Gemini may call. Executed by the background worker and the page's content script. */
export const BROWSER_TOOLS: FunctionDeclaration[] = [
  {
    name: "get_page_text",
    description:
      "Get the readable text of the current page (the main article), to summarize, explain, translate or read it aloud. Long pages come in parts: the result gives nextOffset when there is more.",
    parametersJsonSchema: { type: "object", properties: { offset: { type: "integer", description: "Start from this character (from a previous nextOffset)." } } },
  },
  {
    name: "find_on_page",
    description:
      "Search the page for words: finds the link, button, field, heading or line of text that contains them, anywhere on the page (not just what read_page listed). Returns ids you can click or type into. Use it when the user names something ('click Sign in', 'find the price', 'where is the download button') or when read_page didn't show what you need.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "dismiss_popups",
    description:
      "Close whatever is in the way: cookie banners, newsletter or sign-in pop-ups, consent dialogs. Picks the most private option (reject / close) before accept. Call it when a page is covered by an overlay, a click doesn't land, or the page asks for cookie consent.",
  },
  {
    name: "wait_for",
    description: "Wait for the page to catch up: a few seconds, or until some text appears (e.g. after a search or a click that loads results).",
    parametersJsonSchema: {
      type: "object",
      properties: { seconds: { type: "number", description: "How long at most (1-20). Default 3." }, text: { type: "string", description: "Stop waiting as soon as this text is on the page." } },
    },
  },
  {
    name: "copy_to_clipboard",
    description: "Put text on the user's clipboard (a summary, a link, an address, something from the page).",
    parametersJsonSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "compose_email",
    description:
      "Start an email: opens Gmail's compose window in a new tab with the recipient, subject and body filled in. Write the draft yourself from what the user said; the user reviews and presses send. Use it for 'email X about...', 'write to...', 'draft a mail'.",
    parametersJsonSchema: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    },
  },
  {
    name: "add_calendar_event",
    description:
      "Create a Google Calendar event (opens the pre-filled event page in a new tab for the user to save). Use for 'add a meeting Friday at 3', 'remind me to... on the 5th', 'put dinner with Sam on my calendar'.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "Local date-time like 2026-11-05T15:00 (work it out from what the user said and today's date)." },
        end: { type: "string", description: "Local date-time; defaults to one hour after start." },
        details: { type: "string" },
        location: { type: "string" },
      },
      required: ["title", "start"],
    },
  },
  {
    name: "translate_page",
    description: "Open a translated copy of the current page (Google Translate) in a new tab.",
    parametersJsonSchema: { type: "object", properties: { language: { type: "string", description: "Language code: en, hi, es, fr, de, ar, ja, zh..." } }, required: ["language"] },
  },
  {
    name: "search_history",
    description: "Search the user's browsing history: 'that recipe site from yesterday', 'the article about X I read last week'. Returns titles and links; open one with go_to or open_tab.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" }, days: { type: "integer", description: "How far back to look (default 30)." } }, required: ["query"] },
  },
  { name: "bookmark_page", description: "Bookmark the page the user is on." },
  {
    name: "search_bookmarks",
    description: "Find a saved bookmark by words in its title or address.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "find_tab",
    description: "Find an open tab by words in its title or address and switch to it ('go to my Gmail tab', 'switch to YouTube').",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  { name: "close_duplicate_tabs", description: "Close tabs that are open twice (same address), keeping one of each." },
  {
    name: "zoom_page",
    description: "Make the page bigger or smaller for the user ('make the text bigger', 'zoom out', 'reset zoom').",
    parametersJsonSchema: { type: "object", properties: { level: { type: "number", description: "Zoom factor 0.5-3, e.g. 1.25. Use 1 to reset." } }, required: ["level"] },
  },
  {
    name: "get_selection",
    description: "Get the text the user has highlighted on the page.",
  },
  {
    name: "point_at",
    description:
      "Show the user where to click: a glowing ring and arrow on an element (id from read_page) with a short note. Stays until clear_highlights or the next point_at. Use it to guide step by step.",
    parametersJsonSchema: {
      type: "object",
      properties: { id: { type: "integer" }, note: { type: "string", description: "Very short hint, e.g. 'Click here to sign up'" } },
      required: ["id"],
    },
  },
  { name: "clear_highlights", description: "Remove the guide ring and arrow from the page." },
  {
    name: "play_on_youtube",
    description:
      "Play music or a video: opens YouTube in a new tab, searches for it and starts the first result. Use it for 'play some music', 'play <song>', 'put on <video>'. For vague requests like 'some music', pick something popular yourself, e.g. 'relaxing music' or 'top hits'. Don't ask which song.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string", description: "What to search for, e.g. 'Arijit Singh hits'" } }, required: ["query"] },
  },
  {
    name: "save_screenshot",
    description: "Take a screenshot of the page the user is looking at and save it as an image file in their Downloads/Tekkie folder (also noted in their notes).",
  },
  {
    name: "control_media",
    description:
      "Control music or video playing in ANY tab, even one the user is not looking at: pause, play, skip, mute, volume, seek. It finds the right tab by itself (the one making sound, or a YouTube/Spotify/etc. tab). Use it for 'pause the song', 'stop the music', 'play it again', 'next song', 'mute', 'louder', 'skip 10 seconds'. Never say you can't; just call it.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["pause", "play", "toggle", "next", "previous", "mute", "unmute", "volume", "seek", "restart"] },
        amount: { type: "number", description: "For volume: 0 to 1. For seek: seconds to jump (negative goes back)." },
        tab_id: { type: "number", description: "Only if you know exactly which tab (from list_tabs)." },
      },
      required: ["action"],
    },
  },
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
    description:
      "Open a website in the current tab. Accepts an address or just a well-known name: 'gmail', 'youtube', 'maps', 'drive', 'whatsapp', 'amazon', 'netflix'... Anything it doesn't know is searched on Google.",
    parametersJsonSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "web_search",
    description: "Search Google for something in the current tab.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "open_tab",
    description:
      "Open a website in a NEW tab and switch to it. Prefer this for 'open Gmail', 'open YouTube' and similar, so the page the user is on stays open. Accepts an address or a well-known name like 'gmail', 'youtube', 'maps'.",
    parametersJsonSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  { name: "go_back", description: "Go back one page in the current tab." },
  { name: "go_forward", description: "Go forward one page in the current tab." },
  { name: "reload_page", description: "Reload the current tab." },
  {
    name: "press_key",
    description: "Press a keyboard key in the page, e.g. Enter, Tab, Escape, ArrowDown, PageDown. Use after clicking or typing into something.",
    parametersJsonSchema: {
      type: "object",
      properties: { key: { type: "string", enum: ["Enter", "Tab", "Escape", "Backspace", "Delete", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"] } },
      required: ["key"],
    },
  },
  {
    name: "hover",
    description: "Move the mouse over an element by id, to open hover menus or tooltips.",
    parametersJsonSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  { name: "list_tabs", description: "List the open browser tabs with their ids, titles and which one is active." },
  {
    name: "switch_tab",
    description: "Switch to another open tab by the id from list_tabs.",
    parametersJsonSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "close_tab",
    description: "Close a tab by the id from list_tabs. Ask the user first.",
    parametersJsonSchema: {
      type: "object",
      properties: { id: { type: "integer" }, confirmed: { type: "boolean", description: "True only after the user said yes" } },
      required: ["id"],
    },
  },
];

/** Tools that don't touch web pages, so they stay on even when browser control is off. */
export const COMPANION_TOOLS: FunctionDeclaration[] = [
  {
    name: "emote",
    description: "Show a feeling with Tekkie's body: laugh, celebrate, surprised, sad, love, eat, nod (yes), shake (no), shrug, think, angry, yawn, stretch, wave.",
    parametersJsonSchema: {
      type: "object",
      properties: { feeling: { type: "string", enum: ["laugh", "celebrate", "surprised", "sad", "love", "eat", "nod", "shake", "shrug", "think", "angry", "yawn", "stretch", "wave"] } },
      required: ["feeling"],
    },
  },
  {
    name: "set_look",
    description:
      "Change how Tekkie looks when the user asks: its body (robot, humanoid = a person/buddy, creature = a pet/critter/bunny/cat, yeti = the fluffy blue yeti in goggles and a headset), its skin colour set, or a hat/outfit. E.g. 'turn into a cat' → form creature; 'be a yeti' → yeti; 'be a person' → humanoid; 'wear the crown' → accessory crown; 'go gold' → skin gold.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        form: { type: "string", enum: ["robot", "humanoid", "creature", "yeti"] },
        skin: { type: "string", enum: ["classic", "street", "halloween", "festive", "galaxy", "gold", "custom"] },
        accessory: { type: "string", enum: ["none", "glasses", "cap", "bow", "scarf", "witch-hat", "santa-hat", "crown"] },
      },
    },
  },
  {
    name: "show_plan",
    description: "Show a checklist of steps for a multi-step task. Call before starting work on a job with three or more steps.",
    parametersJsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, steps: { type: "array", items: { type: "string" }, description: "Short steps, 2 to 8" } },
      required: ["steps"],
    },
  },
  {
    name: "update_plan",
    description: "Mark a step of the current plan as doing, done or failed (steps are numbered from 1).",
    parametersJsonSchema: {
      type: "object",
      properties: { step: { type: "integer" }, status: { type: "string", enum: ["doing", "done", "failed"] } },
      required: ["step", "status"],
    },
  },
  { name: "clear_plan", description: "Remove the plan checklist when the task is abandoned." },
  {
    name: "remember",
    description: "Remember one short fact about the user for future chats (name, likes, what they are working on). Never secrets.",
    parametersJsonSchema: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] },
  },
  {
    name: "forget",
    description: "Forget remembered facts that match these words, or everything if what is 'everything'.",
    parametersJsonSchema: { type: "object", properties: { what: { type: "string" } }, required: ["what"] },
  },
  {
    name: "add_note",
    description:
      "Save a note, quote or reminder-to-self for the user. The page they are on (title and address) is added automatically, so a note can be just a few words, or what they asked to remember.",
    parametersJsonSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  { name: "list_notes", description: "List the user's saved notes." },
  {
    name: "add_todo",
    description: "Add an item to the user's to-do list.",
    parametersJsonSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "complete_todo",
    description: "Tick off a to-do (by the words in it).",
    parametersJsonSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  { name: "list_todos", description: "List the user's to-dos." },
  {
    name: "set_reminder",
    description: "Remind the user about something after a number of minutes (1 to 1440). Tekkie pops up and a notification shows.",
    parametersJsonSchema: {
      type: "object",
      properties: { minutes: { type: "number" }, text: { type: "string" } },
      required: ["minutes", "text"],
    },
  },
];
