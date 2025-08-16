import { StorySetting } from "components/StorySetup";
import { GENRES } from "./Genres";

export interface Item {
  id: string;
  name: string;
  description: string;
  type: "weapon" | "tool" | "consumable" | "key" | "misc";
  usable: boolean;
}

export interface StoryBeat {
  id: string;
  storyText: string;
  availableOptions: string[];
  selectedOption?: string;
  itemsFound: Item[];
  timestamp: number;
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  storyBeats: StoryBeat[];
  timestamp: number;
}

export interface GameState {
  storyBeats: StoryBeat[];
  chapters: Chapter[];
  currentOptions: string[];
  inventory: Item[];
  gameEnded: boolean;
  endingType: "positive" | "negative" | null;
  endingMessage: string;
}

export interface Response {
  message: Message;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  tool_calls?: any[];
}

export interface Request {
  options?: {
    seed?: number;
  };
  model?: string;
  messages: Message[];
  tools?: {
    type: "function";
    function: any;
  }[];
  tool_choice?: "auto";
}

export async function fetchAndStream(
  label: string,
  req: Request,
  onChunk?: (chunk: string) => void
): Promise<Message> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  // Add Authorization header if we have a token
  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  const endpoint = "https://api.peerwave.ai/api/chat/stream";

  const finalRequest = {
    model: "fastest",
    ...req,
  };
  console.log(`Generating (${label}): `, finalRequest);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(finalRequest),
  });

  if (!response.ok) {
    // Handle 402 (Payment Required) or other auth-related status codes
    if (response.status === 402) {
      const location = response.headers.get("Location");
      if (location) {
        // Store the pending action before redirecting to auth
        localStorage.setItem("pending_action", label);
        // Redirect to Peerwave auth
        window.location.href = location;
        throw new Error("Redirecting to Peerwave auth");
      }
    }
    throw new Error(
      `Failed to generate ${label}: ${response.status} ${await response.text()}`
    );
  }

  localStorage.removeItem("pending_action");

  // Handle streaming response
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    const toolCalls: any[] = [];

    try {
      let loopDone = false;
      while (!loopDone) {
        const { done, value } = await reader.read();
        if (done) {
          loopDone = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const cleaned = line.trim();
          if (cleaned === "") {
            continue;
          }
          const parsedLine = JSON.parse(cleaned) as Response;
          if (parsedLine?.message?.tool_calls) {
            toolCalls.push(...parsedLine.message.tool_calls);
          }
          const content = parsedLine?.message?.content;
          if (!content) {
            continue;
          }
          if (onChunk) {
            onChunk(content);
          }
          fullContent += content;
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log(`Raw LLM Response (${label}): `, fullContent, toolCalls);
    return {
      role: "assistant",
      content: fullContent,
      tool_calls: toolCalls,
    };
  }
}

export async function generateSettings(
  onChunk?: (chunk: string) => void
): Promise<string> {
  // Randomly select 4 genres from the predefined list
  const selectedGenres = [...GENRES]
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  const resp = await fetchAndStream(
    "generateSettings",
    {
      options: {
        seed: Math.round(Math.random() * 1000000),
      },
      messages: [
        {
          role: "system",
          content:
            "You are a creative story generator. Generate unique and engaging story concepts for an interactive text adventure game. Each concept should be creative and different from typical fantasy tropes. Format your response as plain text with clear structure.",
        },
        {
          role: "user",
          content: `Generate 4 unique story concepts for an interactive text adventure, one for each of these genres: ${selectedGenres.join(
            ", "
          )}.

For each concept, use this exact format:

**Story 1:**
Title: [Creative Title]
Description: [Engaging 1-2 sentence description]
Genre: [Genre from the list above]
Setting: [Specific setting/location]
Character: [Type of character the player embodies]

**Story 2:**
Title: [Creative Title]
Description: [Engaging 1-2 sentence description]
Genre: [Genre from the list above]
Setting: [Specific setting/location]
Character: [Type of character the player embodies]

**Story 3:**
Title: [Creative Title]
Description: [Engaging 1-2 sentence description]
Genre: [Genre from the list above]
Setting: [Specific setting/location]
Character: [Type of character the player embodies]

**Story 4:**
Title: [Creative Title]
Description: [Engaging 1-2 sentence description]
Genre: [Genre from the list above]
Setting: [Specific setting/location]
Character: [Type of character the player embodies]

Make each concept unique, creative, and immediately engaging. Avoid clichéd scenarios.`,
        },
      ],
    },
    onChunk
  );
  return resp.content;
}

export async function generateStoryBeat(
  setting: StorySetting,
  storyContext: string,
  userAction: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  let systemPrompt = `You are a creative storyteller for an interactive text adventure game. 

IMPORTANT: Your job is to write ONLY the story narrative. Do NOT include any action options or choices in your response.

ITEMS: When the player finds, receives, or picks up items in your story, simply describe them naturally in the narrative. The inventory system will automatically detect and add appropriate items.

ENDINGS: You can end the adventure when it reaches a natural conclusion using:
**ENDING: POSITIVE** or **ENDING: NEGATIVE** followed by a final message

RESPONSES: Write engaging, immersive narrative that describes what happens as a result of the player's actions. Focus on vivid descriptions, character development, and story progression. End your response naturally without including any numbered options or choices - those will be generated separately.

Focus on creating compelling narrative moments where the player might discover useful items and experience meaningful consequences for their actions.`;

  if (setting) {
    systemPrompt += `\n\nSetting: ${setting.setting}`;
    systemPrompt += `\n\nCharacter: ${setting.character}`;
    systemPrompt += `\n\nGenre: ${setting.genre}`;
  }

  const messages: Message[] = [
    {
      role: "system",
      content: systemPrompt,
    },
  ];
  if (storyContext.trim() !== "") {
    messages.push({
      role: "assistant",
      content: storyContext,
    });
  }

  if (userAction.trim() !== "") {
    messages.push({
      role: "user",
      content: userAction,
    });
  }

  const resp = await fetchAndStream(
    "fetchStoryContent",
    {
      messages: messages,
    },
    onChunk
  );
  return resp.content;
}

export async function generateStoryBeatActions(
  storyText: string,
  gameState: GameState
): Promise<string[]> {
  const inventoryContext =
    gameState.inventory.length > 0
      ? `\n\nCurrent inventory: ${gameState.inventory
          .map((item) => `${item.name} (${item.description})`)
          .join(", ")}`
      : "";

  const resp = await fetchAndStream("generateStoryOptions", {
    messages: [
      {
        role: "system",
        content: `You are an expert game designer creating action options for an interactive text adventure.
  
  IMPORTANT: Your job is to generate up to 3 numbered action options based on the current story situation.
  
  RULES:
  - Each option should be a clear, actionable choice the player can make
  - Options should be diverse - combat, exploration, social, creative approaches
  - Consider the player's current inventory when suggesting actions
  - Make options engaging and lead to interesting story developments
  - Return ONLY the 3 numbered options, nothing else
  
  FORMAT:
  1. [First action option]
  2. [Second action option]  
  3. [Third action option]`,
      },
      {
        role: "user",
        content: `Based on this story situation, generate up to 3 action options for the player:
  
  ${inventoryContext}
  
  ${storyText}
  
  What are 3 interesting things the player could do next?`,
      },
    ],
  });

  // Parse the options from the response
  const lines = resp.content.split("\n").filter((line) => line.trim());
  const options = lines
    .filter((line) => line.match(/^\d+\.|^[•-]/))
    .map((line) => line.replace(/^\d+\.\s*|^[•-]\s*/, "").trim())
    .filter((option) => option.length > 0)
    .slice(0, 3); // Limit to 3 options

  return options;
}

interface AddItemTool {
  name: "add_item";
  description: string;
  parameters: {
    type: "object";
    properties: {
      item_name: { type: "string"; description: string };
      item_description: { type: "string"; description: string };
      item_type: { type: "string"; enum: string[]; description: string };
    };
    required: string[];
  };
}

interface RemoveItemTool {
  name: "remove_item";
  description: string;
  parameters: {
    type: "object";
    properties: {
      item_name: { type: "string"; description: string };
      reason: { type: "string"; description: string };
    };
    required: string[];
  };
}

export async function checkForItemsToAdd(
  storyText: string,
  currentInventory: Item[],
  previousAction?: string
): Promise<{ itemsToAdd: Item[]; itemsToRemove: string[] }> {
  const addItemTool: AddItemTool = {
    name: "add_item",
    description:
      "Add an item to the player's inventory when they find, receive, or pick up something in the story",
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description:
            'The name of the item (e.g., "Rusty Sword", "Health Potion")',
        },
        item_description: {
          type: "string",
          description: "A brief description of the item and what it does",
        },
        item_type: {
          type: "string",
          enum: ["weapon", "tool", "consumable", "key", "misc"],
          description: "The type/category of the item",
        },
      },
      required: ["item_name", "item_description", "item_type"],
    },
  };

  const removeItemTool: RemoveItemTool = {
    name: "remove_item",
    description:
      "Remove an item from the player's inventory when it gets lost, broken, used up, or taken away in the story",
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description: "The exact name of the item to remove from inventory",
        },
        reason: {
          type: "string",
          description:
            "Brief reason why the item is being removed (e.g., 'broken', 'lost', 'used up', 'stolen')",
        },
      },
      required: ["item_name", "reason"],
    },
  };

  console.log(currentInventory);
  const currentInventoryText =
    currentInventory.length > 0
      ? `Current inventory: ${currentInventory
          .map((item) => `${item.name} (${item.type})`)
          .join(", ")}`
      : "Current inventory: Empty";

  const previousActionText = previousAction
    ? `Previous player action: ${previousAction}\n\n`
    : "";

  try {
    const resp = await fetchAndStream("checkForItemsToAdd", {
      messages: [
        {
          role: "system",
          content: `You are an inventory manager for a text adventure game. Your job is to determine if the player should receive new items or lose existing items based on the story text.

RULES FOR ADDING ITEMS:
- Only call add_item if the story clearly describes the player finding, receiving, picking up, or otherwise acquiring an item
- Do not add items for things just mentioned in passing or already in the environment
- Items should only be added rarely and should be meaningful and descriptive

RULES FOR REMOVING ITEMS:
- Call remove_item if the story describes items being lost, broken, stolen, used up completely, or otherwise removed from the player's possession
- Use the exact item name as it appears in the current inventory
- Provide a brief reason for the removal

If no inventory changes should be made, do nothing.`,
        },
        {
          role: "user",
          content: `${previousActionText}${currentInventoryText}

Analyze this story text and determine if any inventory changes should be made:

"${storyText}"

Should any items be added to or removed from the player's inventory based on this story segment?`,
        },
      ],
      tools: [
        {
          type: "function",
          function: addItemTool,
        },
        {
          type: "function",
          function: removeItemTool,
        },
      ],
      tool_choice: "auto",
    });

    const newItems: Item[] = [];
    const itemsToRemove: string[] = [];

    // Check if the model made any tool calls
    if (resp.tool_calls && resp.tool_calls.length > 0) {
      for (const toolCall of resp.tool_calls) {
        if (toolCall.function.name === "add_item") {
          try {
            const args = toolCall.function.arguments;
            const newItem: Item = {
              id: `item-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
              name: args.item_name,
              description: args.item_description,
              type: args.item_type as Item["type"],
              usable: args.item_type !== "misc",
            };
            if (newItem.name && newItem.description && newItem.type) {
              newItems.push(newItem);
            }
          } catch (e) {
            console.error("Failed to parse add_item tool call arguments:", e);
          }
        } else if (toolCall.function.name === "remove_item") {
          try {
            const args = toolCall.function.arguments;
            if (args.item_name) {
              itemsToRemove.push(args.item_name);
              console.log(`Item removed: ${args.item_name} (${args.reason})`);
            }
          } catch (e) {
            console.error(
              "Failed to parse remove_item tool call arguments:",
              e
            );
          }
        }
      }
    }

    return { itemsToAdd: newItems, itemsToRemove };
  } catch (error) {
    console.error("Error checking for items:", error);
    return { itemsToAdd: [], itemsToRemove: [] };
  }
}

export async function checkForChapterEnd(
  storyText: string,
  recentHistory: string[]
): Promise<boolean> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  try {
    const resp = await fetchAndStream("checkForChapterEnd", {
      messages: [
        {
          role: "system",
          content: `You are an expert story analyst. Your job is to determine if a story segment represents a good place to end a chapter.
  
  A good chapter ending typically:
  - Resolves a major conflict or challenge
  - Completes a significant quest or task
  - Provides a sense of closure to a story arc
  - Reaches a natural pause point in the narrative
  - Concludes with a significant location change or time passage
  - Ends with a major revelation or plot development
  
  Answer with ONLY "YES" or "NO" - nothing else.`,
        },
        {
          role: "user",
          content: `Based on this recent story progression, does the latest story segment represent a good chapter ending?
  
  Recent story context:
  ${recentHistory.join("\n\n")}
  
  Latest story segment:
  ${storyText}
  
  Does this latest segment conclude a chapter? Answer YES or NO only.`,
        },
      ],
    });

    const answer = resp.content.trim().toUpperCase();
    return answer === "YES";
  } catch (error) {
    console.error("Error checking for chapter end:", error);
    return false;
  }
}

export async function generateChapterSummary(
  chapterBeats: StoryBeat[]
): Promise<{ title: string; summary: string }> {
  const chapterText = chapterBeats
    .map((beat) => {
      return `${beat.storyText}${
        beat.selectedOption ? `\n[Choice: ${beat.selectedOption}]` : ""
      }`;
    })
    .join("\n\n");

  try {
    const resp = await fetchAndStream("generateChapterSummary", {
      messages: [
        {
          role: "system",
          content: `You are an expert story editor. Your job is to create a concise chapter summary and title.
  
  Requirements:
  - Create a compelling chapter title (2-8 words)
  - Write a summary that captures the key events and outcomes (2-4 sentences)
  - Focus on major plot points, character development, and important discoveries
  - Maintain narrative flow for future story continuation
  
  Format your response as:
  TITLE: [Chapter Title]
  SUMMARY: [Chapter Summary]`,
        },
        {
          role: "user",
          content: `Please create a title and summary for this chapter:
  
  ${chapterText}`,
        },
      ],
    });

    const content = resp.content;

    // Parse the response
    const titleMatch = content.match(/TITLE:\s*(.+)/i);
    const summaryMatch = content.match(/SUMMARY:\s*(.+)/i);

    const title = titleMatch ? titleMatch[1].trim() : `Chapter ${Date.now()}`;
    const summary = summaryMatch
      ? summaryMatch[1].trim()
      : "A significant chapter in the adventure.";

    return { title, summary };
  } catch (error) {
    console.error("Error generating chapter summary:", error);
    return {
      title: `Chapter ${Date.now()}`,
      summary: "A significant chapter in the adventure.",
    };
  }
}

export function getToken(): string | null {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const token = hashParams.get("token");
  return token;
}
