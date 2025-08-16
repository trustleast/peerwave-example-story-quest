import React, { useState, useEffect, useRef } from "react";
import { TextFormatter } from "./TextFormatter";
import { generateStoryPrompt, StorySetting, StorySetup } from "./StorySetup";
import {
  Chapter,
  checkForChapterEnd,
  checkForItemsToAdd,
  generateStoryBeat,
  generateChapterSummary,
  generateStoryBeatActions,
  getToken,
  Item,
  StoryBeat,
} from "src/LLMUtils";

interface GameState {
  storyBeats: StoryBeat[];
  chapters: Chapter[];
  currentOptions: string[];
  inventory: Item[];
  gameEnded: boolean;
  endingType: "positive" | "negative" | null;
  endingMessage: string;
  setting: StorySetting;
}

// Bump the version any time we change the save format
const STORY_SAVE_KEY = "storyquest_save_v2";

export const StoryGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    storyBeats: [],
    chapters: [],
    currentOptions: [],
    inventory: [],
    gameEnded: false,
    endingType: null,
    endingMessage: "",
    setting: null,
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
  const [showInventory, setShowInventory] = useState(false);
  const [expandedBeats, setExpandedBeats] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set()
  );
  const [selectedItemForCustomAction, setSelectedItemForCustomAction] =
    useState<Item | null>(null);
  const [itemCustomAction, setItemCustomAction] = useState("");

  // Ref for auto-scrolling to latest content
  const storyContainerRef = useRef<HTMLDivElement>(null);

  const handleStartGame = () => {
    setShowStorySetup(true);
  };

  const handleStartStoryWithPrompt = async (setting: StorySetting) => {
    setShowStorySetup(false);
    setStoryTitle(setting.title);
    setGameStarted(true);
    setGameState((prev) => ({
      ...prev,
      setting,
    }));
    await generateNextStoryStep(generateStoryPrompt(setting));
  };

  const handleChoiceSelection = async (choice: string) => {
    // Mark the selected option in the current story beat
    const updatedBeats = [...gameState.storyBeats];
    if (updatedBeats.length > 0) {
      const currentBeat = updatedBeats[updatedBeats.length - 1];
      currentBeat.selectedOption = choice;
    }

    setGameState((prev) => ({
      ...prev,
      storyBeats: updatedBeats,
    }));

    //     const contextPrompt = `Continue this adventure story. Here's what happened previously:
    //
    // Based on the choice "${choice}", continue the story. You may:
    // - Naturally describe the player finding, receiving, or discovering items
    // - Allow positive or negative story endings when appropriate
    // - Create situations where existing items in the player's inventory might be useful
    // - Present meaningful consequences for previous actions
    // `;

    await generateNextStoryStep(choice);
    setCustomAction(""); // Clear custom action after selection
  };

  const handleCustomAction = async () => {
    if (!customAction.trim()) return;

    await handleChoiceSelection(customAction.trim());
  };

  const generateNewOptions = async (latestStoryBeat: string) => {
    try {
      setIsLoading(true);
      setError("");

      // Use the new generateStoryOptions function
      const options = await generateStoryBeatActions(
        latestStoryBeat,
        gameState
      );

      if (options.length > 0) {
        setGameState((prev) => ({
          ...prev,
          currentOptions: options,
        }));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate new options"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemUse = async (item: Item) => {
    if (!item.usable) return;

    const contextPrompt = `I used the item named "${item.name}" (${item.description}) in my inventory. What happens next?`;
    await generateNextStoryStep(contextPrompt);

    // Remove the item if it's consumable
    if (item.type === "consumable") {
      setGameState((prev) => ({
        ...prev,
        inventory: prev.inventory.filter((i) => i.id !== item.id),
      }));
    }
  };

  const handleItemClick = (item: Item) => {
    // Always navigate to the story beat where this item was found
    const beatWithItem = gameState.storyBeats.find((beat) =>
      beat.itemsFound.some((foundItem) => foundItem.id === item.id)
    );

    if (beatWithItem) {
      setShowInventory(false);
      expandBeatAndNavigate(beatWithItem.id);
    }
  };

  const handleItemUseFromModal = (item: Item, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent the navigation click
    setShowInventory(false);
    handleItemUse(item);
  };

  const handleItemCustomAction = async (item: Item) => {
    if (!itemCustomAction.trim()) return;

    const contextPrompt = `I used the item named ${item.name} (${
      item.description
    }) in my inventory in the following way:
"${itemCustomAction.trim()}"`;

    // Clear the custom action and close inventory
    setItemCustomAction("");
    setSelectedItemForCustomAction(null);
    setShowInventory(false);

    // Continue the story based on how the player uses this item with their described action. Show the consequences of using this item in this specific way and how it changes the player's circumstances. You may naturally describe finding new items as a result of this action.`;
    await generateNextStoryStep(contextPrompt);

    // Remove the item if it's consumable
    if (item.type === "consumable") {
      setGameState((prev) => ({
        ...prev,
        inventory: prev.inventory.filter((i) => i.id !== item.id),
      }));
    }
  };

  const toggleBeatExpansion = (beatId: string) => {
    setExpandedBeats((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(beatId)) {
        newSet.delete(beatId);
      } else {
        newSet.add(beatId);
      }
      return newSet;
    });
  };

  const toggleChapterExpansion = (chapterId: string) => {
    setExpandedChapters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(chapterId)) {
        newSet.delete(chapterId);
      } else {
        newSet.add(chapterId);
      }
      return newSet;
    });
  };

  const expandBeatAndNavigate = (beatId: string) => {
    // Find which chapter contains this beat (if any)
    const chapterContainingBeat = gameState.chapters.find((chapter) =>
      chapter.storyBeats.some((beat) => beat.id === beatId)
    );

    // If beat is in a chapter, expand the chapter first
    if (chapterContainingBeat) {
      setExpandedChapters((prev) =>
        new Set(prev).add(chapterContainingBeat.id)
      );
    }

    // Expand the specific beat
    setExpandedBeats((prev) => new Set(prev).add(beatId));

    // Navigate to the beat
    setTimeout(() => {
      const beatElement = document.querySelector(`[data-beat-id="${beatId}"]`);
      if (beatElement) {
        beatElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200); // Longer delay to ensure chapter expansion completes
  };

  const generateNextStoryStep = async (prompt: string) => {
    // Collapse all previous beats when a choice is selected
    setExpandedBeats(new Set());
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");
    setError("");

    // Create context using chapter summaries + recent beats
    let storyContext = "";

    // Add chapter summaries for context
    if (gameState.chapters.length > 0) {
      const chapterSummaries = gameState.chapters.map(
        (chapter) => `Chapter: ${chapter.title}\n${chapter.summary}`
      );
      storyContext += `Previous chapters:\n${chapterSummaries.join(
        "\n\n"
      )}\n\n`;
      storyContext += "Current chapter:\n";
    }

    // Add recent story beats (current chapter)
    const recentBeats = gameState.storyBeats.map((beat) => beat.storyText);

    if (recentBeats.length > 0) {
      storyContext += recentBeats.join("\n");
    }

    let response = "";
    try {
      response = await generateStoryBeat(
        gameState.setting,
        storyContext,
        prompt,
        (chunk: string) => {
          setStreamingText((prev) => prev + chunk);
        }
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate story beat"
      );
      setIsLoading(false);
      return;
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }

    // Check for game ending indicators
    const endingMatch = response.match(
      /(GAME OVER|THE END|ADVENTURE COMPLETE|VICTORY|DEFEAT|ENDING):\s*(POSITIVE|NEGATIVE)/i
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

    // The story text is the entire response (no options parsing needed)
    let storyText = "";
    if (gameEnded) {
      // For ended games, use everything before ending marker as story
      const endingIndex = response.indexOf(endingMatch![0]);
      storyText = response.slice(0, endingIndex).trim();
    } else {
      // Use the whole response as story text
      storyText = response.trim();
    }

    // Create new story beat
    const newBeat: StoryBeat = {
      id: `beat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      storyText,
      availableOptions: [],
      itemsFound: [],
      timestamp: Date.now(),
    };

    // Update game state with new beat
    setGameState((prev) => ({
      ...prev,
      storyBeats: [...prev.storyBeats, newBeat],
      currentOptions: [],
      gameEnded,
      endingType,
      endingMessage,
    }));

    // Auto-expand the newest beat
    setExpandedBeats((prev) => new Set(prev).add(newBeat.id));

    setIsStreaming(false);
    setStreamingText("");

    // Generate options and check for items if game hasn't ended
    if (gameEnded) {
      return;
    }

    try {
      // Generate story options separately
      const generatedOptions = await generateStoryBeatActions(
        storyText,
        gameState
      );

      // Update the game state with the generated options
      setGameState((prev) => ({
        ...prev,
        currentOptions: generatedOptions,
      }));
    } catch (optionsError) {
      console.error("Failed to generate options:", optionsError);
    }

    try {
      // Also check for items to add/remove
      const { itemsToAdd, itemsToRemove } = await checkForItemsToAdd(
        storyText,
        gameState.inventory,
        prompt
      );

      if (itemsToAdd.length > 0 || itemsToRemove.length > 0) {
        // Update both the story beat and inventory
        setGameState((prev) => {
          const updatedBeats = [...prev.storyBeats];
          const currentBeat = updatedBeats[updatedBeats.length - 1];
          if (currentBeat) {
            currentBeat.itemsFound = itemsToAdd;
          }

          // Apply inventory changes
          let updatedInventory = [...prev.inventory];

          // Add new items
          updatedInventory = [...updatedInventory, ...itemsToAdd];

          // Remove items by name
          itemsToRemove.forEach((itemName) => {
            updatedInventory = updatedInventory.filter(
              (item) => item.name !== itemName
            );
          });

          return {
            ...prev,
            storyBeats: updatedBeats,
            inventory: updatedInventory,
          };
        });
      }
    } catch (itemsError) {
      console.error("Failed to check for items:", itemsError);
    }

    try {
      // Check if this story beat should end a chapter (only if we have enough beats)
      let shouldCreateChapter = false;
      if (gameState.storyBeats.length >= 3) {
        // Minimum beats for a chapter
        const recentHistory = gameState.storyBeats
          .slice(-3) // Last 3 beats for context
          .map((beat) => beat.storyText);
        shouldCreateChapter = await checkForChapterEnd(
          storyText,
          recentHistory
        );
      }

      if (shouldCreateChapter) {
        // Create a new chapter from current story beats
        const { title, summary } = await generateChapterSummary(
          gameState.storyBeats
        );

        const newChapter: Chapter = {
          id: `chapter-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          title,
          summary,
          storyBeats: [...gameState.storyBeats],
          timestamp: Date.now(),
        };

        // Move current beats to the chapter and clear story beats
        setGameState((prev) => ({
          ...prev,
          chapters: [...prev.chapters, newChapter],
          storyBeats: [newBeat], // Keep only the latest beat
        }));

        console.log(`Chapter created: "${title}"`);
      }
    } catch (chapterError) {
      console.error("Failed to check for chapter end:", chapterError);
    }

    setIsLoading(false);
  };

  // Load saved game state and handle auth flow on component mount
  useEffect(() => {
    // First, try to load saved game state
    const savedGame = loadGameState();
    if (savedGame) {
      const loadedGameState = savedGame.gameState;
      console.log("Loaded game state:", savedGame);

      setGameState(loadedGameState);
      setGameStarted(savedGame.gameStarted);
      setStoryTitle(savedGame.storyTitle);
      setLoadedFromSave(true);
      if (loadedGameState.storyBeats.length > 0) {
        setExpandedBeats((prev) =>
          new Set(prev).add(
            loadedGameState.storyBeats[loadedGameState.storyBeats.length - 1].id
          )
        );
      }

      // Generate new options if we have story beats but no current options
      if (
        loadedGameState.storyBeats.length > 0 &&
        loadedGameState.currentOptions.length === 0 &&
        !loadedGameState.gameEnded
      ) {
        generateNewOptions(
          loadedGameState.storyBeats[loadedGameState.storyBeats.length - 1]
            .storyText
        );
      }

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
    if (
      gameStarted &&
      !isStreaming &&
      gameState.storyBeats.length > 0 &&
      !loadedFromSave
    ) {
      saveGameState(gameState, gameStarted, storyTitle);
    }
  }, [gameState, gameStarted, storyTitle, isStreaming, loadedFromSave]);

  // Scroll to bottom only on first load
  useEffect(() => {
    if (
      loadedFromSave &&
      gameState.storyBeats.length > 0 &&
      storyContainerRef.current
    ) {
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
      chapters: [],
      currentOptions: [],
      inventory: [],
      gameEnded: false,
      endingType: null,
      endingMessage: "",
      setting: null,
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
      <div className="story-quest-container">
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
      <div className="story-quest-container">
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
    <div className="story-quest-container">
      <div className="story-header">
        <h1 className="title">{storyTitle}</h1>
        <button className="button button-secondary" onClick={resetGame}>
          Start New Adventure
        </button>
      </div>
      {loadedFromSave && (
        <div className="save-indicator">
          <p className="save-text">Game loaded from save</p>
        </div>
      )}
      <div className="story-container" ref={storyContainerRef}>
        {/* Previous Chapters */}
        {gameState.chapters.map((chapter, chapterIndex) => {
          const isChapterExpanded = expandedChapters.has(chapter.id);

          return (
            <div
              key={chapter.id}
              className={`chapter ${
                isChapterExpanded ? "expanded" : "collapsed"
              }`}
            >
              {/* Chapter Header */}
              <div
                className="chapter-header"
                onClick={() => toggleChapterExpansion(chapter.id)}
              >
                <div className="chapter-title">
                  <span className="chapter-number">
                    Chapter {chapterIndex + 1}:
                  </span>
                  <span className="chapter-name">{chapter.title}</span>
                </div>
                <button className="chapter-toggle">
                  {isChapterExpanded ? "−" : "+"}
                </button>
              </div>

              {/* Chapter Summary - Always Visible */}
              <div className="chapter-summary">
                <TextFormatter text={chapter.summary} />
              </div>

              {/* Chapter Beats - Collapsible */}
              {isChapterExpanded && (
                <div className="chapter-beats">
                  {chapter.storyBeats.map((beat, beatIndex) => {
                    const isBeatExpanded = expandedBeats.has(beat.id);

                    return (
                      <div
                        key={beat.id}
                        className={`story-beat chapter-beat ${
                          isBeatExpanded ? "expanded" : "collapsed"
                        }`}
                        data-beat-id={beat.id}
                      >
                        {/* Beat Header */}
                        <div
                          className="beat-header"
                          onClick={() => toggleBeatExpansion(beat.id)}
                        >
                          <div className="beat-title">
                            <span className="beat-number">
                              #{beatIndex + 1}
                            </span>
                            <span className="beat-preview">
                              {beat.storyText.slice(0, 80)}
                              {beat.storyText.length > 80 ? "..." : ""}
                            </span>
                          </div>
                          <button className="beat-toggle">
                            {isBeatExpanded ? "−" : "+"}
                          </button>
                        </div>

                        {/* Beat Content - Collapsible */}
                        {isBeatExpanded && (
                          <div className="beat-content visible">
                            <div className="story-text">
                              <div className="story-content">
                                <TextFormatter text={beat.storyText} />
                              </div>
                            </div>

                            {/* Show items found in this beat */}
                            {beat.itemsFound.length > 0 && (
                              <div className="beat-items-found">
                                <p className="items-found-text">
                                  🎒 Items found:
                                </p>
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
                                <TextFormatter
                                  className="choice-text"
                                  text={`➤ You chose: ${beat.selectedOption}`}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Current Chapter Story Beats */}
        {gameState.storyBeats.map((beat, index) => {
          const isExpanded = expandedBeats.has(beat.id);
          const isLastBeat = index === gameState.storyBeats.length - 1;

          return (
            <div
              key={beat.id}
              className={`story-beat ${isExpanded ? "expanded" : "collapsed"}`}
              data-beat-id={beat.id}
            >
              {/* Beat Header - Always Visible */}
              <div
                className="beat-header"
                onClick={() => toggleBeatExpansion(beat.id)}
              >
                <div className="beat-title">
                  <span className="beat-number">#{index + 1}</span>
                  <span className="beat-preview">
                    {beat.storyText.slice(0, 100)}
                    {beat.storyText.length > 100 ? "..." : ""}
                  </span>
                </div>
                <button className="beat-toggle">
                  {isExpanded ? "−" : "+"}
                </button>
              </div>

              {/* Beat Content - Collapsible */}
              <div
                className={`beat-content ${
                  isExpanded || (isLastBeat && !streamingText)
                    ? "visible"
                    : "hidden"
                }`}
              >
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
                    <TextFormatter
                      className="choice-text"
                      text={`➤ You chose:  ${beat.selectedOption}`}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Current streaming content */}
        {isStreaming && (
          <div className="story-beat expanded">
            <div className={`beat-content visible`}>
              <div className="story-text">
                <div className="story-content">
                  <TextFormatter
                    isStreaming={isStreaming}
                    text={streamingText}
                  />
                </div>
              </div>
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

        {!gameState.gameEnded && isLoading && !isStreaming && (
          <div className="loading-container">
            <p className="loading-text">
              {gameState.storyBeats.length > 0
                ? "The story continues..."
                : "Giving you some options..."}
            </p>
          </div>
        )}

        {!isStreaming &&
          gameState.storyBeats.length > 0 &&
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

        {/* Compact Inventory Button - Always show if has items or streaming to prevent shifts */}
        {gameState.inventory.length > 0 && (
          <div className="inventory-summary">
            <button
              className="button button-inventory"
              onClick={() => setShowInventory(true)}
              disabled={isLoading && !isStreaming}
            >
              Inventory ({gameState.inventory.length})
            </button>
          </div>
        )}
      </div>

      {/* Inventory Modal */}
      {showInventory && !gameState.gameEnded && (
        <div
          className="inventory-modal-overlay"
          onClick={() => {
            setShowInventory(false);
            setSelectedItemForCustomAction(null);
            setItemCustomAction("");
          }}
        >
          <div className="inventory-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inventory-modal-header">
              <h2 className="inventory-modal-title">🎒 Your Inventory</h2>
              <button
                className="inventory-close-button"
                onClick={() => {
                  setShowInventory(false);
                  setSelectedItemForCustomAction(null);
                  setItemCustomAction("");
                }}
              >
                ✕
              </button>
            </div>
            <div className="inventory-modal-content">
              {gameState.inventory.length === 0 ? (
                <p className="empty-inventory">Your inventory is empty</p>
              ) : (
                <>
                  <div className="inventory-modal-grid">
                    {gameState.inventory.map((item) => (
                      <div
                        key={item.id}
                        className="inventory-modal-item"
                        onClick={() => handleItemClick(item)}
                      >
                        <div className="item-header">
                          <span className="item-name">{item.name}</span>
                          <div className="item-actions">
                            {item.usable && (
                              <button
                                className="item-use-button"
                                onClick={(e) => handleItemUseFromModal(item, e)}
                                disabled={isLoading || isStreaming}
                              >
                                ⚡ Use
                              </button>
                            )}
                            <button
                              className="item-use-button custom"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItemForCustomAction(item);
                              }}
                              disabled={isLoading || isStreaming}
                            >
                              ⚙️ Describe
                            </button>
                          </div>
                        </div>
                        <span className="item-description">
                          {item.description}
                        </span>
                        <span className="item-type">{item.type}</span>
                      </div>
                    ))}
                  </div>

                  {/* Custom Action Input */}
                  {selectedItemForCustomAction && (
                    <div className="custom-item-action-section">
                      <h3 className="custom-action-title">
                        Use {selectedItemForCustomAction.name} with custom
                        action:
                      </h3>
                      <div className="custom-item-action-input-group">
                        <input
                          type="text"
                          className="custom-item-action-input"
                          placeholder={`Describe how you want to use ${selectedItemForCustomAction.name}...`}
                          value={itemCustomAction}
                          onChange={(e) => setItemCustomAction(e.target.value)}
                          onKeyPress={(e) => {
                            if (
                              e.key === "Enter" &&
                              !isLoading &&
                              !isStreaming &&
                              itemCustomAction.trim()
                            ) {
                              handleItemCustomAction(
                                selectedItemForCustomAction
                              );
                            }
                          }}
                          disabled={isLoading || isStreaming}
                          autoFocus
                        />
                        <div className="custom-item-action-buttons">
                          <button
                            className="button button-custom-action"
                            onClick={() =>
                              handleItemCustomAction(
                                selectedItemForCustomAction
                              )
                            }
                            disabled={
                              isLoading ||
                              isStreaming ||
                              !itemCustomAction.trim()
                            }
                          >
                            Use It
                          </button>
                          <button
                            className="button button-secondary"
                            onClick={() => {
                              setSelectedItemForCustomAction(null);
                              setItemCustomAction("");
                            }}
                            disabled={isLoading || isStreaming}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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

    // Check if save is recent (within 1 days)
    const sevenDaysAgo = Date.now() - 24 * 60 * 60 * 1000;
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
