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

export async function generateSettings(): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  const response = await fetch("https://api.peerwave.ai/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "cheapest",
      messages: [
        {
          role: "system",
          content:
            "You are a creative story generator. Generate up to 4 unique and engaging story concepts for an interactive text adventure game. Each concept should be creative and different from typical fantasy tropes. Respond with a JSON array of objects.",
        },
        {
          role: "user",
          content: `Generate up to 4 unique story concepts for an interactive text adventure. Return your response as a JSON array with this exact structure:

[
  {
    "title": "Creative Title",
    "description": "Engaging 1-2 sentence description",
    "genre": "Genre type",
    "setting": "Specific setting/location", 
    "character": "Type of character the player embodies"
  },
  {
    "title": "Creative Title",
    "description": "Engaging 1-2 sentence description",
    "genre": "Genre type",
    "setting": "Specific setting/location",
    "character": "Type of character the player embodies"
  },
  {
    "title": "Creative Title", 
    "description": "Engaging 1-2 sentence description",
    "genre": "Genre type",
    "setting": "Specific setting/location",
    "character": "Type of character the player embodies"
  },
  {
    "title": "Creative Title",
    "description": "Engaging 1-2 sentence description", 
    "genre": "Genre type",
    "setting": "Specific setting/location",
    "character": "Type of character the player embodies"
  }
]

Make each concept unique, creative, and immediately engaging. Avoid clichéd scenarios. Return ONLY the JSON array, no additional text.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 402 || response.status === 401) {
      const location = response.headers.get("Location");
      if (location) {
        localStorage.setItem("pending_action", "generate_options");
        window.location.href = location;
        throw new Error("Redirecting to Peerwave auth");
      }
    }
    throw new Error(`Failed to generate story options: ${response.status}`);
  }

  const data = await response.json();
  return data.message.content;
}

export async function fetchStoryContent(
  prompt: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  // Add Authorization header if we have a token
  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  let endpoint = "https://api.peerwave.ai/api/chat";
  if (onChunk !== undefined) {
    endpoint = "https://api.peerwave.ai/api/chat/stream";
  }

  const messages = [
    {
      role: "system",
      content: `You are a creative storyteller for an interactive text adventure game. 
  
  IMPORTANT: Your job is to write ONLY the story narrative. Do NOT include any action options or choices in your response.
  
  ITEMS: When the player finds, receives, or picks up items in your story, simply describe them naturally in the narrative. The inventory system will automatically detect and add appropriate items.
  
  ENDINGS: You can end the adventure when it reaches a natural conclusion using:
  **ENDING: POSITIVE** or **ENDING: NEGATIVE** followed by a final message
  
  RESPONSES: Write engaging, immersive narrative that describes what happens as a result of the player's actions. Focus on vivid descriptions, character development, and story progression. End your response naturally without including any numbered options or choices - those will be generated separately.
  
  Focus on creating compelling narrative moments where the player might discover useful items and experience meaningful consequences for their actions.`,
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  console.log("Generating new story options", messages);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "cheapest",
      messages: messages,
    }),
  });

  if (!response.ok) {
    // Handle 402 (Payment Required) or other auth-related status codes
    if (response.status === 402) {
      const location = response.headers.get("Location");
      if (location) {
        // Store the pending action before redirecting to auth
        localStorage.setItem("pending_action", "start_game");
        // Redirect to Peerwave auth
        window.location.href = location;
        throw new Error("Redirecting to Peerwave auth");
      }
    }
    throw new Error(
      `Failed to generate story: ${response.status} ${await response.text()}`
    );
  }

  localStorage.removeItem("pending_action");

  // Handle streaming response
  if (onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

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
          const parsedLine = JSON.parse(cleaned);
          const content = parsedLine?.message?.content;
          if (!content) {
            continue;
          }
          onChunk(content);
          fullContent += content;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  } else {
    // Non-streaming response
    const data = await response.json();
    return data.message.content;
  }
}

export async function generateStoryOptions(
  storyText: string,
  gameState: GameState
): Promise<string[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  const inventoryContext =
    gameState.inventory.length > 0
      ? `\n\nCurrent inventory: ${gameState.inventory
          .map((item) => `${item.name} (${item.description})`)
          .join(", ")}`
      : "";

  const response = await fetch("https://api.peerwave.ai/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "cheapest",
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
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate options: ${response.status}`);
  }

  const data = await response.json();
  const optionsText = data.message.content;

  // Parse the options from the response
  const lines = optionsText.split("\n").filter((line) => line.trim());
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

export async function checkForItemsToAdd(
  storyText: string,
  currentInventory: Item[]
): Promise<Item[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

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

  const currentInventoryText =
    currentInventory.length > 0
      ? `Current inventory: ${currentInventory
          .map((item) => `${item.name} (${item.type})`)
          .join(", ")}`
      : "Inventory is empty";

  try {
    const response = await fetch("https://api.peerwave.ai/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "cheapest",
        messages: [
          {
            role: "system",
            content: `You are an inventory manager for a text adventure game. Your job is to determine if the player should receive any new items based on the story text.
  
  RULES:
  - Only call the add_item tool if the story clearly describes the player finding, receiving, picking up, or otherwise acquiring an item
  - Do NOT add items for things that are just mentioned in passing or already in the environment
  - Do NOT add duplicate items that are already in the player's inventory
  - Be selective - not every story segment should result in new items
  - Items should be useful, interesting, or plot-relevant
  
  ${currentInventoryText}
  
  If no items should be added, respond with just "No items to add" and do not call any tools.`,
          },
          {
            role: "user",
            content: `Analyze this story text and determine if the player should receive any new items:
  
  "${storyText}"
  
  Should any items be added to the player's inventory based on this story segment?`,
          },
        ],
        tools: [
          {
            type: "function",
            function: addItemTool,
          },
        ],
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      console.error("Item check failed:", response.status);
      return [];
    }

    const data = await response.json();
    const newItems: Item[] = [];

    // Check if the model made any tool calls
    if (data.message.tool_calls && data.message.tool_calls.length > 0) {
      for (const toolCall of data.message.tool_calls) {
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
            console.error("Failed to parse tool call arguments:", e);
          }
        }
      }
    }

    return newItems;
  } catch (error) {
    console.error("Error checking for items:", error);
    return [];
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
    const response = await fetch("https://api.peerwave.ai/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "cheapest",
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
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const answer = data.message.content.trim().toUpperCase();
    return answer === "YES";
  } catch (error) {
    console.error("Error checking for chapter end:", error);
    return false;
  }
}

export async function generateChapterSummary(
  chapterBeats: StoryBeat[]
): Promise<{ title: string; summary: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  const chapterText = chapterBeats
    .map((beat) => {
      return `${beat.storyText}${
        beat.selectedOption ? `\n[Choice: ${beat.selectedOption}]` : ""
      }`;
    })
    .join("\n\n");

  try {
    const response = await fetch("https://api.peerwave.ai/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "cheapest",
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
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate chapter summary");
    }

    const data = await response.json();
    const content = data.message.content;

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
