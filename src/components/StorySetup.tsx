import React, { useState, useEffect } from "react";
import { generateSettings } from "src/LLMUtils";

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

  useEffect(() => {
    const getSettings = () => {
      setIsLoadingOptions(true);

      generateSettings()
        .then((optionsResponse) => {
          const parsedOptions = parseStoryOptions(optionsResponse);
          setStoryOptions(parsedOptions);
        })
        .catch((err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to generate story options"
          );
          getSettings();
        })
        .finally(() => {
          setIsLoadingOptions(false);
        });
    };
    getSettings();
  }, []);

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

function getCleanedJSON(jsonString: string): string {
  if (!jsonString.startsWith("[")) {
    jsonString = "[" + jsonString;
  }
  if (!jsonString.endsWith("]")) {
    jsonString += "]";
  }

  // Remove duplicate ""s if they are preceeded by text
  jsonString = jsonString.replace(/(\w+)""/g, '$1"');
  return jsonString;
}

function parseStoryOptions(response: string): StorySetting[] {
  console.log("Raw LLM response:", response);

  // Strategy 1: Try to parse as JSON first
  const jsonOptions = tryParseAsJSON(getCleanedJSON(response));
  if (jsonOptions.length > 0) {
    console.log("Successfully parsed JSON format");
    return jsonOptions;
  }

  // Strategy 2: Flexible text parsing with multiple patterns
  const textOptions = tryParseAsText(response);
  if (textOptions.length > 0) {
    console.log("Successfully parsed text format");
    return textOptions;
  }

  // Strategy 3: Regex-based parsing for loose format
  const regexOptions = tryParseWithRegex(response);
  if (regexOptions.length > 0) {
    console.log("Successfully parsed with regex");
    return regexOptions;
  }

  // Strategy 4: Fallback options
  console.warn("All parsing strategies failed, using fallback options");
  throw new Error("Failed to parse story options");
}

function tryParseAsJSON(response: string): StorySetting[] {
  try {
    // Look for JSON array or object in the response
    const jsonMatch = response.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const options = Array.isArray(parsed) ? parsed : [parsed];

      return options.map((option: any, index: number) => ({
        id: `option-${index}`,
        title: option.title || option.name || `Option ${index + 1}`,
        description:
          option.description || option.desc || "An exciting adventure awaits.",
        genre: option.genre || "Adventure",
        setting: option.setting || option.location || "Unknown realm",
        character: option.character || option.role || "Adventurer",
      }));
    }
  } catch (error) {
    console.log("JSON parsing failed:", error);
  }
  return [];
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

function tryParseWithRegex(response: string): StorySetting[] {
  const options: StorySetting[] = [];

  // Try to find sections that look like story options
  const sectionRegex = /(.{10,100}[\.\!\?])\s*[\n\r]*(.{20,200})/g;
  let match;
  let count = 0;

  while ((match = sectionRegex.exec(response)) && count < 4) {
    const title = match[1].trim().replace(/^\d+\.?\s*/, "");
    const description = match[2].trim();

    if (title && description) {
      options.push({
        id: `option-${count}`,
        title: title,
        description: description,
        genre: "Adventure",
        setting: "Mysterious realm",
        character: "Adventurer",
      });
      count++;
    }
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
