import React, { useState, useEffect } from "react";

export const TextSummarizer: React.FC = () => {
  const [inputText, setInputText] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);

  const handleSummarizeWithText = async (
    token: string,
    textToSummarize: string
  ) => {
    try {
      setIsLoading(true);
      setError("");

      const summary = await fetchSummary(token, textToSummarize);
      setSummaryText(summary);
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

    // Check for pending text from auth flow
    const pendingText = localStorage.getItem("pending_text");
    if (pendingText) {
      setInputText(pendingText);

      // If we just returned from auth with a token, automatically summarize
      if (token) {
        // Use a small delay to ensure state is updated
        setTimeout(() => {
          handleSummarizeWithText(token, pendingText);
        }, 100);
      }
    }
  }, [authToken]);

  if (summaryText) {
    return (
      <>
        <div className="summary-container">
          <p className="summary-text">{summaryText}</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => {
            setSummaryText("");
            setInputText("");
            setError("");
          }}
        >
          Summarize Something Else
        </button>
      </>
    );
  }

  return (
    <>
      <textarea
        className="textarea"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Paste your text here and let AI create a concise summary for you..."
      />
      {error && (
        <div className="error-container">
          <p className="error-text">{error}</p>
        </div>
      )}
      <button
        className={`button button-primary ${isLoading ? "button-loading" : ""}`}
        onClick={() => handleSummarizeWithText(authToken, inputText)}
        disabled={isLoading}
      >
        {isLoading ? "" : "Summarize"}
      </button>
    </>
  );
};

async function fetchSummary(
  authToken: string | null,
  textToSummarize: string
): Promise<string> {
  if (!textToSummarize.trim()) {
    throw new Error("Please enter some text to summarize");
  }

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
          role: "user",
          content: `Please provide a concise summary of the following text:\n\n${textToSummarize}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    // Handle 402 (Payment Required) or other auth-related status codes
    if (response.status === 402 || response.status === 401) {
      const location = response.headers.get("Location");
      if (location) {
        // Store the text before redirecting to auth
        localStorage.setItem("pending_text", textToSummarize);
        // Redirect to Peerwave auth
        window.location.href = location;
        throw new Error("Redirecting to Peerwave auth");
      }
    }
    throw new Error(
      `Failed to get summary: ${response.status} ${await response.text()}`
    );
  }

  localStorage.removeItem("pending_text");

  const data = await response.json();
  return data.message.content;
}
