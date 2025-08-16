import React, { useState, useEffect } from "react";
import { generateSettings } from "src/LLMUtils";
import { TextFormatter } from "./TextFormatter";

interface StorySetupProps {
  onStartStory: (setting: StorySetting) => void;
  isLoading: boolean;
}

export interface StorySetting {
  id: string;
  title: string;
  description: string;
  genre: string;
  setting: string;
  character: string;
}

export const StorySetup: React.FC<StorySetupProps> = ({
  onStartStory,
  isLoading,
}) => {
  const [storyOptions, setStoryOptions] = useState<StorySetting[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const getSettings = () => {
      setIsLoadingOptions(true);
      setIsStreaming(true);
      setStreamingText("");

      generateSettings((chunk: string) => {
        setStreamingText((prev) => prev + chunk);
      })
        .then((optionsResponse) => {
          const parsedOptions = parseStoryOptions(optionsResponse);
          setStoryOptions(parsedOptions);
          setError("");
          setIsLoadingOptions(false);
          setIsStreaming(false);
          setStreamingText("");
        })
        .catch((err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to generate story options"
          );
          setIsStreaming(false);
          setStreamingText("");
          if (error.includes("Redirecting to Peerwave auth")) {
            return;
          }
          setTimeout(() => {
            getSettings();
          }, 1000);
        });
    };
    getSettings();
  }, [error]);

  const handleOptionSelect = (option: StorySetting) => {
    onStartStory(option);
  };

  if (error) {
    return (
      <div className="story-setup">
        <div className="error-container">
          <p className="error-text">{error}</p>
        </div>
        <div className="loading-container">
          <p className="loading-text">Trying again...</p>
        </div>
      </div>
    );
  }

  if (isLoadingOptions) {
    return (
      <div className="story-setup">
        <div className="loading-container">
          <p className="loading-text">Crafting story possibilities...</p>
          {isStreaming && streamingText && (
            <div className="streaming-progress">
              <div className="streaming-text">
                <TextFormatter text={streamingText} isStreaming={true} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="story-setup">
      <div className="story-options-grid">
        {storyOptions.map((option) => (
          <button
            key={option.id}
            className={`story-option-card ${isLoading ? "disabled" : ""}`}
            onClick={() => handleOptionSelect(option)}
            disabled={isLoading}
          >
            <div className="option-header">
              <h3 className="option-title">{option.title}</h3>
            </div>
            <p className="option-description">{option.description}</p>
            <div className="option-details">
              <span className="option-genre">🎭 {option.genre}</span>
              <span className="option-setting">📍 {option.setting}</span>
              <span className="option-character">👤 {option.character}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

function parseStoryOptions(response: string): StorySetting[] {
  const options: StorySetting[] = [];

  // Split response into story blocks using **Story N:** pattern
  const storyBlocks = response.split(/\*\*Story \d+:\*\*/);

  // Remove the first empty element if it exists
  if (storyBlocks[0].trim() === "") {
    storyBlocks.shift();
  }

  for (let i = 0; i < storyBlocks.length; i++) {
    const block = storyBlocks[i].trim();
    if (!block) continue;

    const option = parseStoryBlock(block, i);
    if (option) {
      options.push(option);
    }
  }

  // Fallback to try the old parsing methods if new format fails
  if (options.length === 0) {
    console.log("New format parsing failed, trying fallback methods");
    return tryParseAsText(response);
  }

  return options;
}

function parseStoryBlock(block: string, index: number): StorySetting | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  const option: Partial<StorySetting> = {
    id: `option-${index}`,
  };

  for (const line of lines) {
    if (line.match(/^Title:\s*/i)) {
      option.title = line.replace(/^Title:\s*/i, "").trim();
    } else if (line.match(/^Description:\s*/i)) {
      option.description = line.replace(/^Description:\s*/i, "").trim();
    } else if (line.match(/^Genre:\s*/i)) {
      option.genre = line.replace(/^Genre:\s*/i, "").trim();
    } else if (line.match(/^Setting:\s*/i)) {
      option.setting = line.replace(/^Setting:\s*/i, "").trim();
    } else if (line.match(/^Character:\s*/i)) {
      option.character = line.replace(/^Character:\s*/i, "").trim();
    }
  }

  // Validate that we have all required fields
  if (
    option.title &&
    option.description &&
    option.genre &&
    option.setting &&
    option.character
  ) {
    return option as StorySetting;
  }

  return null;
}

function tryParseAsText(response: string): StorySetting[] {
  const lines = response.split("\n").filter((line) => line.trim());
  const options: StorySetting[] = [];
  let currentOption: Partial<StorySetting> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();

    // More flexible title matching - numbers, letters, or bullets
    if (trimmedLine.match(/^(\d+\.|\w\)|\*|\-|•)\s*(.+)/)) {
      // Save previous option if we have at least title and description
      if (currentOption.title && currentOption.description) {
        options.push(createStoryOption(currentOption, options.length));
      }

      // Extract title, removing the prefix
      const titleMatch = trimmedLine.match(/^(\d+\.|\w\)|\*|\-|•)\s*(.+)/);
      currentOption = {
        title: titleMatch ? titleMatch[2].trim() : trimmedLine,
      };
    }
    // Flexible field matching (case-insensitive, with or without colons)
    else if (trimmedLine.match(/^description:?\s*/i)) {
      currentOption.description = trimmedLine
        .replace(/^description:?\s*/i, "")
        .trim();
    } else if (trimmedLine.match(/^genre:?\s*/i)) {
      currentOption.genre = trimmedLine.replace(/^genre:?\s*/i, "").trim();
    } else if (trimmedLine.match(/^setting:?\s*/i)) {
      currentOption.setting = trimmedLine.replace(/^setting:?\s*/i, "").trim();
    } else if (trimmedLine.match(/^character:?\s*/i)) {
      currentOption.character = trimmedLine
        .replace(/^character:?\s*/i, "")
        .trim();
    }
    // If we have a title but no description, treat next non-empty line as description
    else if (
      currentOption.title &&
      !currentOption.description &&
      trimmedLine.length > 10
    ) {
      currentOption.description = trimmedLine;
    }
  }

  // Add the last option
  if (currentOption.title && currentOption.description) {
    options.push(createStoryOption(currentOption, options.length));
  }

  return options;
}

function createStoryOption(
  partial: Partial<StorySetting>,
  index: number
): StorySetting {
  return {
    id: `option-${index}`,
    title: partial.title || `Adventure ${index + 1}`,
    description: partial.description || "An exciting adventure awaits you.",
    genre: partial.genre || "Adventure",
    setting: partial.setting || "Unknown realm",
    character: partial.character || "Adventurer",
  };
}

export function generateStoryPrompt(setting: StorySetting): string {
  return `Create an engaging ${setting.genre.toLowerCase()} story based on this concept:

  Title: ${setting.title}
  Description: ${setting.description}
  Setting: ${setting.setting}
  Character Type: ${setting.character}
  
  Start the adventure by describing the opening scene in detail. Set up the character's situation and the immediate challenge they face. Make it immersive and compelling.`;
}
