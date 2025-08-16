import React, { useState, useEffect } from "react";
import { TextFormatter } from "./TextFormatter";
import { StorySpeechButton } from "./StorySpeechButton";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";

interface GameState {
  storyText: string;
  options: string[];
  history: string[];
}

export const StoryGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    storyText: "",
    options: [],
    history: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  
  // Get speech state to control the gradient animation
  const { speaking, cancel: cancelSpeech } = useSpeechSynthesis();

  const handleStartGame = async (internalAuthToken: string) => {
    // Cancel any ongoing speech when starting new game
    cancelSpeech();
    
    await generateNextStoryStep(
      internalAuthToken,
      "Start a new fantasy adventure story. You are a brave adventurer standing at the entrance to a mysterious forest. Describe the scene and provide 3 possible actions.",
      []
    );
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

    const contextPrompt = `Continue this adventure story. Here's what happened previously:
    
${newHistory.join("\n\n")}

Based on the choice "${choice}", continue the story and provide 3 new options for what to do next.`;

    await generateNextStoryStep(authToken, contextPrompt, newHistory);
  };

  const generateNextStoryStep = async (
    token: string | null,
    prompt: string,
    history: string[]
  ) => {
    try {
      setIsLoading(true);
      setError("");

      const response = await fetchStoryContent(token, prompt);

      // Parse the response to extract story and options
      const lines = response.split("\n").filter((line) => line.trim());

      // Find where options start (look for numbered items or bullet points)
      let optionsStartIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\d+\.|^[•-]/)) {
          optionsStartIndex = i;
          break;
        }
      }

      let storyText = "";
      let options: string[] = [];

      if (optionsStartIndex > -1) {
        // Story is everything before options
        storyText = lines.slice(0, optionsStartIndex).join("\n").trim();

        // Options are the numbered/bulleted items
        options = lines
          .slice(optionsStartIndex)
          .map((line) => line.replace(/^\d+\.\s*|^[•-]\s*/, "").trim())
          .filter((option) => option.length > 0)
          .slice(0, 3); // Limit to 3 options
      } else {
        // If no clear options found, use the whole response as story
        storyText = response.trim();
        // Provide generic options
        options = [
          "Continue exploring",
          "Look around carefully",
          "Think about your next move",
        ];
      }

      setGameState({
        storyText,
        options,
        history,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Extract token from URL hash fragment on component mount
  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.substring(1));
    const token = hashParams.get("token");
    if (token) {
      setAuthToken(token);
    }

    // Check for pending action from auth flow
    const pendingAction = localStorage.getItem("pending_action");
    if (pendingAction && token) {
      // Auto-start game if returning from auth
      setTimeout(() => {
        handleStartGame(token);
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
    });
    setGameStarted(false);
    setError("");
  };

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
          onClick={() => handleStartGame(authToken)}
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
        <div className={`story-text ${speaking ? 'speaking' : ''}`}>
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

        {gameState.options.length > 0 && !isLoading && (
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

async function fetchStoryContent(
  authToken: string | null,
  prompt: string
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  // Add Authorization header if we have a token
  if (authToken) {
    headers["Authorization"] = authToken;
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
            "You are a creative storyteller for an interactive text adventure game. Always end your responses with exactly 3 numbered action options that the player can choose from. Keep the story engaging and immersive.",
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
