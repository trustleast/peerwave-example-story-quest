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

  // Check if speech synthesis is supported
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setSupported(true);

      // Load voices
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
      };

      loadVoices();

      // Some browsers load voices asynchronously
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
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

      if (voice) {
        utterance.voice = voice;
      }

      // Event handlers
      utterance.onstart = () => {
        setSpeaking(true);
        setPaused(false);
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
    [supported, rate, pitch, volume, voice, cleanTextForSpeech]
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
    setSpeaking(false);
    setPaused(false);
    setCurrentText("");
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) return;

    // Since pause/resume is unreliable, we'll stop instead
    window.speechSynthesis.cancel();
    setPaused(true);
    setSpeaking(false);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported || !currentText) return;

    // Restart from the beginning since resume is unreliable
    speak(currentText);
    setPaused(false);
  }, [supported, currentText, speak]);

  // Update speaking and paused state based on speechSynthesis state
  useEffect(() => {
    if (!supported) return;

    const checkStatus = () => {
      setSpeaking(window.speechSynthesis.speaking);
      setPaused(window.speechSynthesis.pending);
    };

    const interval = setInterval(checkStatus, 100);

    return () => clearInterval(interval);
  }, [supported]);

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
  };
};
