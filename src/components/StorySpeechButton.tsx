import React from "react";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { VoiceSelector } from "./VoiceSelector";

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
  const {
    speakStoryAndOptions,
    paused,
    pause,
    resume,
    speaking,
    supported,
    localeVoices,
    selectedVoice,
    setSelectedVoice,
  } = useSpeechSynthesis({
    rate: 1,
    pitch: 1,
    volume: 1,
  });

  if (!supported) {
    return null; // Don't render if speech synthesis is not supported
  }

  console.log("speaking", speaking, "paused", paused);

  const handleClick = () => {
    if (speaking) {
      pause();
    } else if (paused) {
      resume();
    } else {
      speakStoryAndOptions(storyText, options);
    }
  };

  const getButtonText = () => {
    if (speaking) {
      return variant === "icon" ? "⏸️" : "Pause";
    } else if (paused) {
      return variant === "icon" ? "▶️" : "Resume";
    } else {
      return variant === "icon" ? "🔊" : "Read";
    }
  };

  return (
    <div className={`speech-controls ${className}`}>
      <div className="speech-controls-row">
        <button
          className={`speech-button speech-button-${variant} speech-button-${size} ${
            speaking ? "speech-button-active" : ""
          }`}
          onClick={handleClick}
        >
          {getButtonText()}
        </button>

        {localeVoices.length > 0 && (
          <VoiceSelector
            voices={localeVoices}
            selectedVoice={selectedVoice}
            onVoiceChange={setSelectedVoice}
            className="story-voice-selector"
          />
        )}
      </div>
    </div>
  );
};
