import React, { useState, useEffect, useRef } from "react";
import { TextFormatter } from "./TextFormatter";
import { generateStoryPrompt, StorySetting, StorySetup } from "./StorySetup";
import { getToken } from "src/util";

interface Item {
  id: string;
  name: string;
  description: string;
  type: "weapon" | "tool" | "consumable" | "key" | "misc";
  usable: boolean;
}

interface StoryBeat {
  id: string;
  storyText: string;
  availableOptions: string[];
  selectedOption?: string;
  itemsFound: Item[];
  timestamp: number;
}

interface GameState {
  storyBeats: StoryBeat[];
  currentOptions: string[];
  inventory: Item[];
  gameEnded: boolean;
  endingType: "positive" | "negative" | null;
  endingMessage: string;
}

export const StoryGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    storyBeats: [],
    currentOptions: [],
    inventory: [],
    gameEnded: false,
    endingType: null,
    endingMessage: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [showStorySetup, setShowStorySetup] = useState(false);
  const [customAction, setCustomAction] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadedFromSave, setLoadedFromSave] = useState(false);

  // Ref for auto-scrolling to latest content
  const storyContainerRef = useRef<HTMLDivElement>(null);

  const handleStartGame = () => {
    setShowStorySetup(true);
  };

  const handleStartStoryWithPrompt = async (setting: StorySetting) => {
    setShowStorySetup(false);
    setStoryTitle(setting.title);
    setGameStarted(true);
    await generateNextStoryStep(generateStoryPrompt(setting));
  };

  const handleChoiceSelection = async (choice: string) => {
    // Mark the selected option in the current story beat
    const updatedBeats = [...gameState.storyBeats];
    if (updatedBeats.length > 0) {
      const currentBeat = updatedBeats[updatedBeats.length - 1];
      currentBeat.selectedOption = choice;
    }

    setGameState(prev => ({
      ...prev,
      storyBeats: updatedBeats
    }));

    // Create context from story beats history
    const storyHistory = gameState.storyBeats.map(beat => 
      `${beat.storyText}${beat.selectedOption ? `\n\nYou chose: ${beat.selectedOption}` : ''}`
    );

    const inventoryContext =
      gameState.inventory.length > 0
        ? `\n\nCurrent inventory: ${gameState.inventory
            .map((item) => `${item.name} (${item.description})`)
            .join(", ")}`
        : "";

    const contextPrompt = `Continue this adventure story. Here's what happened previously:
    
${storyHistory.join("\n\n")}${inventoryContext}

Based on the choice "${choice}", continue the story. You may:
- Naturally describe the player finding, receiving, or discovering items
- Allow positive or negative story endings when appropriate  
- Create situations where existing items in the player's inventory might be useful
- Present meaningful consequences for previous actions

Provide 3 new options for what to do next, or if the story has reached a natural conclusion, you may end it with either a positive or negative outcome.`;

    await generateNextStoryStep(contextPrompt);
    setCustomAction(""); // Clear custom action after selection
  };

  const handleCustomAction = async () => {
    if (!customAction.trim()) return;

    await handleChoiceSelection(customAction.trim());
  };

  const handleItemUse = async (item: Item) => {
    if (!item.usable) return;

    // Create context from story beats history
    const storyHistory = gameState.storyBeats.map(beat => 
      `${beat.storyText}${beat.selectedOption ? `\n\nYou chose: ${beat.selectedOption}` : ''}`
    );
    const newHistory = [
      ...storyHistory,
      `You used: ${item.name}`,
    ];

    const inventoryContext =
      gameState.inventory.length > 0
        ? `\n\nCurrent inventory: ${gameState.inventory
            .map((i) => `${i.name} (${i.description})`)
            .join(", ")}`
        : "";

    const contextPrompt = `Continue this adventure story. The player has just used an item from their inventory.

Previous story:
${newHistory.join("\n\n")}${inventoryContext}

The player used: ${item.name} - ${item.description}

Continue the story based on how using this item affects the situation. Show the consequences of using this item and how it changes the player's circumstances. You may naturally describe finding new items as a result of using this one. Provide 3 new options for what to do next, or end the adventure if appropriate.`;

    // Remove the item if it's consumable
    if (item.type === "consumable") {
      setGameState((prev) => ({
        ...prev,
        inventory: prev.inventory.filter((i) => i.id !== item.id),
      }));
    }

    await generateNextStoryStep(contextPrompt);
  };

  const generateNextStoryStep = async (prompt: string) => {
    try {
      setIsLoading(true);
      setIsStreaming(true);
      setStreamingText("");
      setError("");

      const response = await fetchStoryContent(prompt, (chunk: string) => {
        setStreamingText((prev) => prev + chunk);
      });

      console.log("Raw LLM Response:", response);

      // Parse the response to extract story and endings
      const lines = response.split("\n").filter((line) => line.trim());

      // Check for game ending indicators
      const endingMatch = response.match(
        /\*\*(GAME OVER|THE END|ADVENTURE COMPLETE|VICTORY|DEFEAT|ENDING):\s*(POSITIVE|NEGATIVE)\*\*/i
      );
      let gameEnded = false;
      let endingType: "positive" | "negative" | null = null;
      let endingMessage = "";

      if (endingMatch) {
        gameEnded = true;
        endingType = endingMatch[2].toLowerCase() as "positive" | "negative";
        // Extract ending message (everything after the ending marker)
        const endingIndex = response.indexOf(endingMatch[0]);
        endingMessage = response
          .slice(endingIndex + endingMatch[0].length)
          .trim();
      }

      // Find where options start (look for numbered items or bullet points)
      let optionsStartIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\d+\.|^[•-]/) && !lines[i].includes("GAME OVER")) {
          optionsStartIndex = i;
          break;
        }
      }

      let storyText = "";
      let options: string[] = [];

      if (gameEnded) {
        // For ended games, use everything before ending marker as story
        const endingIndex = response.indexOf(endingMatch![0]);
        storyText = response.slice(0, endingIndex).trim();
      } else if (optionsStartIndex > -1) {
        // Story is everything before options
        const filteredLines = cleanOptionDescriptions(
          lines.slice(0, optionsStartIndex)
        );
        storyText = filteredLines.join("\n").trim();

        // Options are the numbered/bulleted items
        options = lines
          .slice(optionsStartIndex)
          .map((line) => line.replace(/^\d+\.\s*|^[•-]\s*/, "").trim())
          .filter((option) => option.length > 0)
          .slice(0, 3); // Limit to 3 options
      } else {
        // If no clear options found, use the whole response as story
        storyText = response.trim();
      }

      // Create new story beat
      const newBeat: StoryBeat = {
        id: `beat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        storyText,
        availableOptions: options,
        itemsFound: [],
        timestamp: Date.now(),
      };

      // Update game state with new beat
      setGameState((prev) => ({
        ...prev,
        storyBeats: [...prev.storyBeats, newBeat],
        currentOptions: options,
        gameEnded,
        endingType,
        endingMessage,
      }));

      setIsStreaming(false);
      setStreamingText("");

      // Make a second call to determine if items should be added
      if (!gameEnded) {
        const newItems = await checkForItemsToAdd(
          storyText,
          gameState.inventory
        );
        if (newItems.length > 0) {
          // Update both the story beat and inventory
          setGameState((prev) => {
            const updatedBeats = [...prev.storyBeats];
            const currentBeat = updatedBeats[updatedBeats.length - 1];
            if (currentBeat) {
              currentBeat.itemsFound = newItems;
            }
            
            return {
              ...prev,
              storyBeats: updatedBeats,
              inventory: [...prev.inventory, ...newItems],
            };
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText("");
    }
  };

  // Load saved game state and handle auth flow on component mount
  useEffect(() => {
    // First, try to load saved game state
    const savedGame = loadGameState();
    if (savedGame) {
      setGameState(savedGame.gameState);
      setGameStarted(savedGame.gameStarted);
      setStoryTitle(savedGame.storyTitle);
      setLoadedFromSave(true);

      // Hide the loaded indicator after a few seconds
      setTimeout(() => {
        setLoadedFromSave(false);
      }, 3000);
    }

    // Check for pending action from auth flow
    const token = getToken();
    const pendingAction = localStorage.getItem("pending_action");
    if (pendingAction && token) {
      // Auto-start story setup if returning from auth
      setTimeout(() => {
        if (
          pendingAction === "generate_options" ||
          pendingAction === "start_game"
        ) {
          setShowStorySetup(true);
        }
        localStorage.removeItem("pending_action");
      }, 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save game state whenever it changes (but not during streaming or on initial load)
  useEffect(() => {
    if (gameStarted && !isStreaming && gameState.storyBeats.length > 0 && !loadedFromSave) {
      saveGameState(gameState, gameStarted, storyTitle);
    }
  }, [gameState, gameStarted, storyTitle, isStreaming, loadedFromSave]);

  // Scroll to bottom only on first load
  useEffect(() => {
    if (loadedFromSave && gameState.storyBeats.length > 0 && storyContainerRef.current) {
      // Smooth scroll to bottom when loading from save
      storyContainerRef.current.scrollTo({
        top: storyContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [loadedFromSave, gameState.storyBeats.length]);

  const resetGame = () => {
    clearSavedGame();
    setGameState({
      storyBeats: [],
      currentOptions: [],
      inventory: [],
      gameEnded: false,
      endingType: null,
      endingMessage: "",
    });
    setGameStarted(false);
    setShowStorySetup(false);
    setError("");
    setCustomAction("");
    setStoryTitle("");
    setStreamingText("");
    setIsStreaming(false);
    setLoadedFromSave(false);
  };

  if (showStorySetup) {
    return (
      <div className="card">
        <h1 className="title">Pick your setting</h1>
        <StorySetup
          onStartStory={handleStartStoryWithPrompt}
          isLoading={isLoading}
        />
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="card">
        <h1 className="title">Story Quest</h1>
        <p className="subtitle">An AI-powered interactive text adventure</p>
        <div className="story-intro">
          <p className="intro-text">
            Welcome to Story Quest! Embark on an AI-generated interactive
            adventure where your choices shape the story.
          </p>
        </div>
        {error && (
          <div className="error-container">
            <p className="error-text">{error}</p>
          </div>
        )}
        <button
          className={`button button-primary ${
            isLoading ? "button-loading" : ""
          }`}
          onClick={handleStartGame}
          disabled={isLoading}
        >
          {isLoading ? "" : "Start Your Adventure"}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="title">{storyTitle}</h1>
      {loadedFromSave && (
        <div className="save-indicator">
          <p className="save-text">Game loaded from save</p>
        </div>
      )}
      <div className="story-container" ref={storyContainerRef}>
        {/* Story Beat History */}
        {gameState.storyBeats.map((beat) => (
          <div key={beat.id} className="story-beat">
            <div className="story-text">
              <div className="story-content">
                <TextFormatter text={beat.storyText} />
              </div>
            </div>
            
            {/* Show items found in this beat */}
            {beat.itemsFound.length > 0 && (
              <div className="beat-items-found">
                <p className="items-found-text">🎒 Items found:</p>
                <div className="found-items-list">
                  {beat.itemsFound.map((item) => (
                    <span key={item.id} className="found-item">
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Show selected option for this beat */}
            {beat.selectedOption && (
              <div className="beat-choice">
                <p className="choice-text">➤ You chose: {beat.selectedOption}</p>
              </div>
            )}
          </div>
        ))}
        
        {/* Current streaming content */}
        {isStreaming && (
          <div className="story-text">
            <div className="story-content">
              <TextFormatter
                isStreaming={isStreaming}
                text={streamingText}
              />
            </div>
          </div>
        )}

        {/* Inventory Display */}
        {gameState.inventory.length > 0 && (
          <div className="inventory-container">
            <h3 className="inventory-title">Inventory</h3>
            <div className="inventory-grid">
              {gameState.inventory.map((item) => (
                <div key={item.id} className="inventory-item">
                  <div className="item-info">
                    <span className="item-name">{item.name}</span>
                    <span className="item-description">{item.description}</span>
                    <span className="item-type">{item.type}</span>
                  </div>
                  {item.usable && !gameState.gameEnded && (
                    <button
                      className="button button-item-use"
                      onClick={() => handleItemUse(item)}
                      disabled={isLoading || isStreaming}
                    >
                      Use
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game Ending Display */}
        {gameState.gameEnded && (
          <div className={`ending-container ending-${gameState.endingType}`}>
            <h2 className="ending-title">
              {gameState.endingType === "positive"
                ? "🎉 Victory!"
                : "💀 Game Over"}
            </h2>
            {gameState.endingMessage && (
              <div className="ending-message">
                <TextFormatter text={gameState.endingMessage} />
              </div>
            )}
          </div>
        )}

        {/* Action Options */}
        {gameState.currentOptions.length > 0 &&
          !isLoading &&
          !isStreaming &&
          !gameState.gameEnded && (
            <div className="options-container">
              <h3 className="options-title">What do you do?</h3>
              <div className="options-grid">
                {gameState.currentOptions.map((option, index) => (
                  <button
                    key={index}
                    className="button button-option"
                    onClick={() => handleChoiceSelection(option)}
                    disabled={isLoading || isStreaming}
                  >
                    <TextFormatter text={option} />
                  </button>
                ))}
                <div className="custom-action-input-group">
                  <input
                    type="text"
                    className="custom-action-input"
                    placeholder="Describe what you want to do..."
                    value={customAction}
                    onChange={(e) => setCustomAction(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !isLoading && !isStreaming) {
                        handleCustomAction();
                      }
                    }}
                    disabled={isLoading || isStreaming}
                  />
                  <button
                    className="button button-custom-action"
                    onClick={handleCustomAction}
                    disabled={isLoading || isStreaming || !customAction.trim()}
                  >
                    Try It
                  </button>
                </div>
              </div>
            </div>
          )}

        {isLoading && !isStreaming && (
          <div className="loading-container">
            <p className="loading-text">The story continues...</p>
          </div>
        )}
      </div>

      {error && (
        <div className="error-container">
          <p className="error-text">{error}</p>
        </div>
      )}

      <div className="game-controls">
        <button className="button button-secondary" onClick={resetGame}>
          Start New Adventure
        </button>
      </div>
    </div>
  );
};

const STORY_SAVE_KEY = "storyquest_save";

interface SavedGameState {
  gameState: GameState;
  gameStarted: boolean;
  storyTitle: string;
  timestamp: number;
}

function saveGameState(
  gameState: GameState,
  gameStarted: boolean,
  storyTitle: string
) {
  try {
    const saveData: SavedGameState = {
      gameState,
      gameStarted,
      storyTitle,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(saveData));
  } catch (error) {
    console.warn("Failed to save game state:", error);
  }
}

function loadGameState(): SavedGameState | null {
  try {
    const saved = localStorage.getItem(STORY_SAVE_KEY);
    if (!saved) return null;

    const saveData = JSON.parse(saved) as SavedGameState;

    // Check if save is recent (within 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (saveData.timestamp < sevenDaysAgo) {
      localStorage.removeItem(STORY_SAVE_KEY);
      return null;
    }

    return saveData;
  } catch (error) {
    console.warn("Failed to load game state:", error);
    localStorage.removeItem(STORY_SAVE_KEY);
    return null;
  }
}

function clearSavedGame() {
  localStorage.removeItem(STORY_SAVE_KEY);
}

const ignoredSentenceEndings = ["options", "choices", "response"].map(
  (ending) => ending + ":"
);
function cleanOptionDescriptions(sentences: string[]): string[] {
  // Remove the last sentence if it describes user options
  if (sentences.length > 1) {
    let lastSentence = sentences[sentences.length - 1].toLowerCase().trim();
    if (lastSentence.endsWith("**")) {
      lastSentence = lastSentence.slice(0, -2);
    }

    if (
      ignoredSentenceEndings.some((ending) => lastSentence.endsWith(ending))
    ) {
      return sentences.slice(0, -1);
    }
  }

  return sentences;
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

async function checkForItemsToAdd(
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

async function fetchStoryContent(
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "cheapest",
      messages: [
        {
          role: "system",
          content: `You are a creative storyteller for an interactive text adventure game. 

ITEMS: When the player finds, receives, or picks up items in your story, simply describe them naturally in the narrative. The inventory system will automatically detect and add appropriate items.

ENDINGS: You can end the adventure when it reaches a natural conclusion using:
**ENDING: POSITIVE** or **ENDING: NEGATIVE** followed by a final message

RESPONSES: Unless ending the game, always end your responses with exactly 3 numbered action options that the player can choose from. Keep the story engaging and immersive.

Focus on creating compelling narrative moments where the player might discover useful items, face meaningful choices, and experience consequences for their actions.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
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
