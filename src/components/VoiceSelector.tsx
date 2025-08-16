import React, { useState } from "react";

interface VoiceSelectorProps {
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  onVoiceChange: (voice: SpeechSynthesisVoice | null) => void;
  className?: string;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  voices,
  selectedVoice,
  onVoiceChange,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (voices.length === 0) {
    return null; // Don't render if no voices available
  }

  const handleVoiceSelect = (voice: SpeechSynthesisVoice) => {
    onVoiceChange(voice);
    setIsOpen(false);
  };

  const getVoiceDisplayName = (voice: SpeechSynthesisVoice) => {
    // Extract a cleaner name for display
    let displayName = voice.name;
    
    // Remove common prefixes/suffixes
    displayName = displayName
      .replace(/^(Microsoft|Google|Apple|Amazon)\s+/i, '')
      .replace(/\s+(Voice|TTS|Speech)$/i, '')
      .replace(/\s+\(.*?\)$/, ''); // Remove parentheses content
    
    // Add gender/quality indicators if available
    const quality = voice.localService ? '🏠' : '☁️'; // Local vs cloud
    
    return `${quality} ${displayName}`;
  };

  const getCurrentDisplayName = () => {
    if (!selectedVoice) return "Select Voice";
    return getVoiceDisplayName(selectedVoice);
  };

  return (
    <div className={`voice-selector ${className}`}>
      <button
        className={`voice-selector-button ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Choose a voice for story reading"
      >
        <span className="voice-selector-text">{getCurrentDisplayName()}</span>
        <span className="voice-selector-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <>
          <div 
            className="voice-selector-overlay" 
            onClick={() => setIsOpen(false)}
          />
          <div className="voice-selector-dropdown" role="listbox">
            {voices.map((voice, index) => (
              <button
                key={`${voice.name}-${voice.lang}-${index}`}
                className={`voice-option ${
                  selectedVoice?.name === voice.name ? 'selected' : ''
                }`}
                onClick={() => handleVoiceSelect(voice)}
                role="option"
                aria-selected={selectedVoice?.name === voice.name}
              >
                <div className="voice-option-main">
                  <span className="voice-name">{getVoiceDisplayName(voice)}</span>
                  <span className="voice-lang">{voice.lang}</span>
                </div>
                {voice.default && (
                  <span className="voice-default-badge">Default</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};