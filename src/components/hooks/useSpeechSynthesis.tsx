import { useState, useEffect, useCallback } from "react";

interface UseSpeechSynthesisOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice | null;
}

interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  speakStoryAndOptions: (storyText: string, options: string[]) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  speaking: boolean;
  paused: boolean;
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  localeVoices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  setSelectedVoice: (voice: SpeechSynthesisVoice | null) => void;
}

export const useSpeechSynthesis = (
  options: UseSpeechSynthesisOptions = {}
): UseSpeechSynthesisReturn => {
  const { rate = 1, pitch = 1, volume = 1, voice = null } = options;

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentText, setCurrentText] = useState<string>("");
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [localeVoices, setLocaleVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] =
    useState<SpeechSynthesisVoice | null>(voice);

  // Check if speech synthesis is supported
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setSupported(true);

      // Load voices
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);

        // Filter voices by user's locale
        const userLocale = navigator.language || "en-US";
        const userLanguage = userLocale.split("-")[0]; // Get language code (e.g., 'en' from 'en-US')

        const filteredVoices = availableVoices.filter((innerVoice) => {
          // Match exact locale first (e.g., 'en-US')
          if (innerVoice.lang === userLocale) return true;

          // Then match language code (e.g., 'en' matches 'en-GB', 'en-AU', etc.)
          if (innerVoice.lang.startsWith(userLanguage + "-")) return true;

          // Fallback to any voice that starts with the language code
          return innerVoice.lang.startsWith(userLanguage);
        });

        setLocaleVoices(filteredVoices);

        // Auto-select the first local voice if none is selected
        if (!selectedVoice && filteredVoices.length > 0) {
          // Try to find the default voice first
          const defaultVoice =
            filteredVoices.find((innerVoice) => innerVoice.default) ||
            filteredVoices[0];
          setSelectedVoice(defaultVoice);

          // Try to load from localStorage
          const savedVoiceName = localStorage.getItem("storyquest-voice");
          if (savedVoiceName) {
            const savedVoice = filteredVoices.find(
              (innerVoice) => innerVoice.name === savedVoiceName
            );
            if (savedVoice) {
              setSelectedVoice(savedVoice);
            }
          }
        }
      };

      loadVoices();

      // Some browsers load voices asynchronously
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up function to strip markdown formatting for speech
  const cleanTextForSpeech = useCallback((text: string): string => {
    return (
      text
        // Remove bold formatting **text**
        .replace(/\*\*(.*?)\*\*/g, "$1")
        // Remove italic formatting *text*
        .replace(/\*([^*]+)\*/g, "$1")
        // Remove bullet points and convert to readable format
        .replace(/^[-*]\s+/gm, "")
        // Clean up extra whitespace
        .replace(/\s+/g, " ")
        .trim()
    );
  }, []);

  // Function to combine story text with options for speech
  const combineStoryAndOptions = useCallback(
    (storyText: string, innerOptions: string[]): string => {
      const cleanStory = cleanTextForSpeech(storyText);

      if (innerOptions.length === 0) {
        return cleanStory;
      }

      const cleanOptions = innerOptions.map(
        (option, index) => `Option ${index + 1}: ${cleanTextForSpeech(option)}`
      );

      return `${cleanStory}. Your options are: ${cleanOptions.join(". ")}`;
    },
    [cleanTextForSpeech]
  );

  const speak = useCallback(
    (text: string) => {
      if (!supported) {
        console.warn("Speech synthesis not supported");
        return;
      }

      // Cancel any current speech
      window.speechSynthesis.cancel();

      const cleanText = cleanTextForSpeech(text);

      if (cleanText.length === 0) {
        return;
      }

      // Store the current text for potential restart
      setCurrentText(cleanText);

      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Set voice options
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      } else if (voice) {
        utterance.voice = voice;
      }

      // Event handlers
      utterance.onstart = () => {
        console.log("Utterance start");
        setSpeaking(true);
        setPaused(false);
      };

      utterance.onpause = () => {
        console.log("Utterance pause");
        setSpeaking(false);
        setPaused(true);
      };

      utterance.onresume = () => {
        console.log("Utterance resume");
        setPaused(false);
        setSpeaking(true);
      };

      utterance.onend = () => {
        setSpeaking(false);
        setPaused(false);
        setCurrentText("");
      };

      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event.error);
        setSpeaking(false);
        setPaused(false);
        setCurrentText("");
      };

      window.speechSynthesis.speak(utterance);
    },
    [supported, rate, pitch, volume, voice, selectedVoice, cleanTextForSpeech]
  );

  const speakStoryAndOptions = useCallback(
    (storyText: string, innerOptions: string[]) => {
      const combinedText = combineStoryAndOptions(storyText, innerOptions);
      speak(combinedText);
    },
    [combineStoryAndOptions, speak]
  );

  const cancel = useCallback(() => {
    if (!supported) return;

    window.speechSynthesis.cancel();
    setCurrentText("");
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) {
      console.log("Speech synthesis not supported");
      return;
    }

    // Since pause/resume is unreliable, we'll stop instead
    window.speechSynthesis.pause();
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported || !currentText) return;

    // Restart from the beginning since resume is unreliable
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported, currentText]);

  const handleVoiceSelection = useCallback(
    (innerVoice: SpeechSynthesisVoice | null) => {
      // Cancel any current speech when voice changes
      if (speaking || paused) {
        window.speechSynthesis.cancel();
        setCurrentText("");
      }

      setSelectedVoice(innerVoice);
      // Save to localStorage for persistence
      if (innerVoice) {
        localStorage.setItem("storyquest-voice", innerVoice.name);
      } else {
        localStorage.removeItem("storyquest-voice");
      }
    },
    [speaking, paused]
  );

  return {
    speak,
    speakStoryAndOptions,
    cancel,
    pause,
    resume,
    speaking,
    paused,
    supported,
    voices,
    localeVoices,
    selectedVoice,
    setSelectedVoice: handleVoiceSelection,
  };
};
