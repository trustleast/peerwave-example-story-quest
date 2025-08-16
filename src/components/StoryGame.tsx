import React, { useState, useEffect } from "react";
import { TextFormatter } from "./TextFormatter";
import { StorySpeechButton } from "./StorySpeechButton";
import { StorySetup } from "./StorySetup";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { getToken } from "src/util";

interface Item {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'tool' | 'consumable' | 'key' | 'misc';
  usable: boolean;
}

interface GameState {
  storyText: string;
  options: string[];
  history: string[];
  inventory: Item[];
  gameEnded: boolean;
  endingType: 'positive' | 'negative' | null;
  endingMessage: string;
}

export const StoryGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    storyText: "",
    options: [],
    history: [],
    inventory: [],
    gameEnded: false,
    endingType: null,
    endingMessage: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [showStorySetup, setShowStorySetup] = useState(false);

  // Get speech state to control the gradient animation
  const { speaking, cancel: cancelSpeech } = useSpeechSynthesis();

  const handleStartGame = () => {
    // Cancel any ongoing speech when starting new game
    cancelSpeech();
    setShowStorySetup(true);
  };

  const handleStartStoryWithPrompt = async (customPrompt: string) => {
    setShowStorySetup(false);
    await generateNextStoryStep(customPrompt, []);
    setGameStarted(true);
  };

  const handleChoiceSelection = async (choice: string) => {
    // Cancel any ongoing speech when user makes a choice
    cancelSpeech();

    const newHistory = [
      ...gameState.history,
      gameState.storyText,
      `You chose: ${choice}`,
    ];

    const inventoryContext = gameState.inventory.length > 0 
      ? `\n\nCurrent inventory: ${gameState.inventory.map(item => `${item.name} (${item.description})`).join(', ')}`
      : '';

    const contextPrompt = `Continue this adventure story. Here's what happened previously:
    
${newHistory.join("\n\n")}${inventoryContext}

Based on the choice "${choice}", continue the story. You may:
- Give the player new items (weapons, tools, keys, etc.) by describing them in the story
- Allow positive or negative story endings when appropriate
- Create situations where items can be useful

Provide 3 new options for what to do next, or if the story has reached a natural conclusion, you may end it with either a positive or negative outcome.`;

    await generateNextStoryStep(contextPrompt, newHistory);
  };

  const handleItemUse = async (item: Item) => {
    if (!item.usable) return;

    const newHistory = [
      ...gameState.history,
      gameState.storyText,
      `You used: ${item.name}`,
    ];

    const inventoryContext = gameState.inventory.length > 0 
      ? `\n\nCurrent inventory: ${gameState.inventory.map(i => `${i.name} (${i.description})`).join(', ')}`
      : '';

    const contextPrompt = `Continue this adventure story. The player has just used an item from their inventory.

Previous story:
${newHistory.join("\n\n")}${inventoryContext}

The player used: ${item.name} - ${item.description}

Continue the story based on how using this item affects the situation. Provide 3 new options for what to do next, or end the adventure if appropriate.`;

    // Remove the item if it's consumable
    if (item.type === 'consumable') {
      setGameState(prev => ({
        ...prev,
        inventory: prev.inventory.filter(i => i.id !== item.id)
      }));
    }

    await generateNextStoryStep(contextPrompt, newHistory);
  };

  const generateNextStoryStep = async (prompt: string, history: string[]) => {
    try {
      setIsLoading(true);
      setError("");

      const response = await fetchStoryContent(prompt);

      // Parse the response to extract story, items, and endings
      const lines = response.split("\n").filter((line) => line.trim());
      
      // Check for game ending indicators
      const endingMatch = response.match(/\*\*(GAME OVER|THE END|ADVENTURE COMPLETE|VICTORY|DEFEAT|ENDING):\s*(POSITIVE|NEGATIVE)\*\*/i);
      let gameEnded = false;
      let endingType: 'positive' | 'negative' | null = null;
      let endingMessage = "";

      if (endingMatch) {
        gameEnded = true;
        endingType = endingMatch[2].toLowerCase() as 'positive' | 'negative';
        // Extract ending message (everything after the ending marker)
        const endingIndex = response.indexOf(endingMatch[0]);
        endingMessage = response.slice(endingIndex + endingMatch[0].length).trim();
      }

      // Parse items from the story (look for item descriptions)
      const newItems: Item[] = [];
      const itemMatches = response.matchAll(/\*\*ITEM:\s*([^*]+)\*\*\s*-?\s*([^*\n]+)/gi);
      for (const match of itemMatches) {
        const itemName = match[1].trim();
        const itemDesc = match[2].trim();
        const itemType = determineItemType(itemName, itemDesc);
        
        newItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: itemName,
          description: itemDesc,
          type: itemType,
          usable: itemType !== 'misc'
        });
      }

      // Find where options start (look for numbered items or bullet points)
      let optionsStartIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\d+\.|^[•-]/) && !lines[i].includes('ITEM:') && !lines[i].includes('GAME OVER')) {
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
        options = []; // No options when game is over
      } else if (optionsStartIndex > -1) {
        // Story is everything before options
        storyText = lines.slice(0, optionsStartIndex).join("\n").trim();

        // Options are the numbered/bulleted items
        options = lines
          .slice(optionsStartIndex)
          .map((line) => line.replace(/^\d+\.\s*|^[•-]\s*/, "").trim())
          .filter((option) => option.length > 0 && !option.includes('ITEM:'))
          .slice(0, 3); // Limit to 3 options
      } else {
        // If no clear options found, use the whole response as story
        storyText = response.trim();
        // Provide generic options only if game hasn't ended
        options = gameEnded ? [] : [
          "Continue exploring",
          "Look around carefully",
          "Think about your next move",
        ];
      }

      // Clean up story text (remove item markers)
      storyText = storyText.replace(/\*\*ITEM:\s*[^*]+\*\*\s*-?\s*[^*\n]+/gi, '').trim();

      setGameState(prev => ({
        storyText,
        options,
        history,
        inventory: [...prev.inventory, ...newItems],
        gameEnded,
        endingType,
        endingMessage,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Extract token from URL hash fragment on component mount
  useEffect(() => {
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

  const resetGame = () => {
    // Cancel any ongoing speech when resetting game
    cancelSpeech();

    setGameState({
      storyText: "",
      options: [],
      history: [],
      inventory: [],
      gameEnded: false,
      endingType: null,
      endingMessage: "",
    });
    setGameStarted(false);
    setShowStorySetup(false);
    setError("");
  };

  if (showStorySetup) {
    return (
      <StorySetup
        onStartStory={handleStartStoryWithPrompt}
        isLoading={isLoading}
      />
    );
  }

  if (!gameStarted) {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      <div className="story-container">
        <div className={`story-text ${speaking ? "speaking" : ""}`}>
          <div className="story-content">
            <TextFormatter text={gameState.storyText} />
          </div>
          <div className="story-controls">
            <StorySpeechButton
              storyText={gameState.storyText}
              options={gameState.options}
              className="story-speech-button"
              variant="primary"
              size="medium"
            />
          </div>
        </div>

        {/* Inventory Display */}
        {gameState.inventory.length > 0 && (
          <div className="inventory-container">
            <h3 className="inventory-title">🎒 Inventory</h3>
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
                      disabled={isLoading}
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
              {gameState.endingType === 'positive' ? '🎉 Victory!' : '💀 Game Over'}
            </h2>
            {gameState.endingMessage && (
              <div className="ending-message">
                <TextFormatter text={gameState.endingMessage} />
              </div>
            )}
          </div>
        )}

        {/* Action Options */}
        {gameState.options.length > 0 && !isLoading && !gameState.gameEnded && (
          <div className="options-container">
            <h3 className="options-title">What do you do?</h3>
            <div className="options-grid">
              {gameState.options.map((option, index) => (
                <button
                  key={index}
                  className="button button-option"
                  onClick={() => handleChoiceSelection(option)}
                >
                  <TextFormatter text={option} />
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
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
    </>
  );
};

function determineItemType(name: string, description: string): Item['type'] {
  const text = (name + ' ' + description).toLowerCase();
  
  if (text.includes('sword') || text.includes('weapon') || text.includes('blade') || text.includes('gun') || text.includes('bow')) {
    return 'weapon';
  }
  if (text.includes('key') || text.includes('unlock')) {
    return 'key';
  }
  if (text.includes('potion') || text.includes('food') || text.includes('drink') || text.includes('heal') || text.includes('consume')) {
    return 'consumable';
  }
  if (text.includes('rope') || text.includes('tool') || text.includes('torch') || text.includes('map') || text.includes('compass')) {
    return 'tool';
  }
  return 'misc';
}

async function fetchStoryContent(prompt: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  // Add Authorization header if we have a token
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
          content: `You are a creative storyteller for an interactive text adventure game. 

ITEMS: You can give the player items by including them in your story using this format:
**ITEM: Item Name** - Description of the item

ENDINGS: You can end the adventure when it reaches a natural conclusion using:
**ENDING: POSITIVE** or **ENDING: NEGATIVE** followed by a final message

RESPONSES: Unless ending the game, always end your responses with exactly 3 numbered action options that the player can choose from. Keep the story engaging and immersive.

Examples:
- **ITEM: Rusty Sword** - An old but still sharp blade found in the ruins
- **ITEM: Health Potion** - A glowing red vial that restores vitality
- **ENDING: POSITIVE** You have successfully completed your quest and saved the kingdom!`,
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

  const data = await response.json();
  return data.message.content;
}
