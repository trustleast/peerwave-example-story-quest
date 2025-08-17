import React, { useState, useEffect } from "react";
import { getToken } from "src/util";

interface StorySetupProps {
  onStartStory: (prompt: string) => void;
  isLoading: boolean;
}

interface StoryOption {
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
  const [storyOptions, setStoryOptions] = useState<StoryOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [, setSelectedOption] = useState<StoryOption | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsLoadingOptions(true);
    setError("");

    fetchStoryOptions()
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
      })
      .finally(() => {
        setIsLoadingOptions(false);
      });
  }, []);

  const handleOptionSelect = (option: StoryOption) => {
    setSelectedOption(option);

    const storyPrompt = `Create an engaging ${option.genre.toLowerCase()} story based on this concept:

Title: ${option.title}
Description: ${option.description}
Setting: ${option.setting}
Character Type: ${option.character}

Start the adventure by describing the opening scene in detail. Set up the character's situation and the immediate challenge they face. End with exactly 3 numbered action options for the player to choose from. Make it immersive and compelling.`;

    onStartStory(storyPrompt);
  };

  if (isLoadingOptions) {
    return (
      <div className="story-setup">
        <div className="story-setup-header">
          <h2 className="setup-title">Generating Story Options</h2>
          <p className="setup-subtitle">
            Creating unique adventures for you...
          </p>
        </div>
        <div className="loading-container">
          <p className="loading-text">Crafting story possibilities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="story-setup">
        <div className="story-setup-header">
          <h2 className="setup-title">Story Quest</h2>
          <p className="setup-subtitle">
            An AI-powered interactive text adventure
          </p>
        </div>
        <div className="error-container">
          <p className="error-text">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="story-setup">
      <div className="story-setup-header">
        <h2 className="setup-title">Choose Your Adventure</h2>
        <p className="setup-subtitle">
          Select a story concept to begin your quest
        </p>
      </div>

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
              <span className="option-genre">{option.genre}</span>
            </div>
            <p className="option-description">{option.description}</p>
            <div className="option-details">
              <span className="option-setting">📍 {option.setting}</span>
              <span className="option-character">👤 {option.character}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

async function fetchStoryOptions(): Promise<string> {
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

function parseStoryOptions(response: string): StoryOption[] {
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
  return getFallbackOptions();
}

function tryParseAsJSON(response: string): StoryOption[] {
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

function tryParseAsText(response: string): StoryOption[] {
  const lines = response.split("\n").filter((line) => line.trim());
  const options: StoryOption[] = [];
  let currentOption: Partial<StoryOption> = {};

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

function tryParseWithRegex(response: string): StoryOption[] {
  const options: StoryOption[] = [];

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
  partial: Partial<StoryOption>,
  index: number
): StoryOption {
  return {
    id: `option-${index}`,
    title: partial.title || `Adventure ${index + 1}`,
    description: partial.description || "An exciting adventure awaits you.",
    genre: partial.genre || "Adventure",
    setting: partial.setting || "Unknown realm",
    character: partial.character || "Adventurer",
  };
}

function getFallbackOptions(): StoryOption[] {
  return [
    {
      id: "fallback-1",
      title: "The Cosmic Detective",
      description:
        "Investigate mysterious disappearances across multiple dimensions as a reality-hopping detective.",
      genre: "Sci-Fi Mystery",
      setting: "Interdimensional hub city",
      character: "Dimensional Detective",
    },
    {
      id: "fallback-2",
      title: "The Dream Architect",
      description:
        "Shape and explore surreal dreamscapes while protecting sleeping minds from nightmare entities.",
      genre: "Surreal Fantasy",
      setting: "The collective unconscious",
      character: "Dream Walker",
    },
    {
      id: "fallback-3",
      title: "The Time Merchant",
      description:
        "Trade moments, memories, and temporal artifacts in a marketplace that exists outside of time.",
      genre: "Time Travel",
      setting: "The Temporal Bazaar",
      character: "Chrono Trader",
    },
    {
      id: "fallback-4",
      title: "The Memory Thief",
      description:
        "Navigate a world where memories are currency and you specialize in extracting the impossible to forget.",
      genre: "Cyberpunk",
      setting: "Neo-Tokyo 2087",
      character: "Memory Hacker",
    },
  ];
}
