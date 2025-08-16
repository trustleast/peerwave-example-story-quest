import React from "react";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";

interface StorySpeechButtonProps {
  storyText: string;
  options: string[];
  className?: string;
  variant?: "primary" | "secondary" | "icon";
  size?: "small" | "medium" | "large";
}

export const StorySpeechButton: React.FC<StorySpeechButtonProps> = ({
  storyText,
  options,
  className = "",
  variant = "primary",
  size = "medium",
}) => {
  const { speakStoryAndOptions, cancel, speaking, supported } =
    useSpeechSynthesis({
      rate: 0.9,
      pitch: 1,
      volume: 0.8,
    });

  if (!supported) {
    return null; // Don't render if speech synthesis is not supported
  }

  const handleClick = () => {
    if (speaking) {
      cancel();
    } else {
      speakStoryAndOptions(storyText, options);
    }
  };

  const getButtonText = () => {
    if (speaking) {
      return variant === "icon" ? "⏹️" : "Stop Reading";
    } else {
      return variant === "icon" ? "🔊" : "Read Story & Options";
    }
  };

  const getButtonTitle = () => {
    if (speaking) {
      return "Stop reading story and options";
    } else {
      return options.length > 0
        ? "Read the story text and all available options aloud"
        : "Read the story text aloud";
    }
  };

  return (
    <div className={`speech-controls ${className}`}>
      <button
        className={`speech-button speech-button-${variant} speech-button-${size} ${
          speaking ? "speech-button-active" : ""
        }`}
        onClick={handleClick}
        title={getButtonTitle()}
      >
        {getButtonText()}
      </button>
    </div>
  );
};
