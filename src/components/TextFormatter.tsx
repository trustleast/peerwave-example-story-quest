import React from "react";

interface TextFormatterProps {
  text: string;
  className?: string;
}

interface FormattedElement {
  type: "text" | "bold" | "italic" | "list" | "line-break";
  content: string;
  items?: string[];
}

export const TextFormatter: React.FC<TextFormatterProps> = ({
  text,
  className = "",
}) => {
  const parseText = (rawText: string): FormattedElement[] => {
    const elements: FormattedElement[] = [];
    const lines = rawText.split("\n");

    let currentListItems: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if line is a list item (starts with - or *)
      const listMatch = line.match(/^[-*]\s+(.+)$/);
      if (listMatch) {
        currentListItems.push(listMatch[1]);
        continue;
      }

      // If we have accumulated list items and this line is not a list item, output the list
      if (currentListItems.length > 0) {
        elements.push({
          type: "list",
          content: "",
          items: [...currentListItems],
        });
        currentListItems = [];
      }

      // Skip empty lines
      if (!line) {
        if (
          elements.length > 0 &&
          elements[elements.length - 1].type !== "line-break"
        ) {
          elements.push({ type: "line-break", content: "" });
        }
        continue;
      }

      // Process inline formatting for non-list lines
      const formattedElements = parseInlineFormatting(line);
      elements.push(...formattedElements);

      // Add line break if not the last line
      if (i < lines.length - 1) {
        elements.push({ type: "line-break", content: "" });
      }
    }

    // Handle any remaining list items
    if (currentListItems.length > 0) {
      elements.push({
        type: "list",
        content: "",
        items: currentListItems,
      });
    }

    return elements;
  };

  const parseInlineFormatting = (innerText: string): FormattedElement[] => {
    const elements: FormattedElement[] = [];
    let currentIndex = 0;

    // Regular expressions for different formatting
    const boldRegex = /\*\*(.+?)\*\*/g;
    const italicRegex = /\*(.+?)\*/g;

    // Find all matches for bold and italic
    const allMatches: Array<{
      start: number;
      end: number;
      type: "bold" | "italic";
      content: string;
    }> = [];

    // Find bold matches (**text**)
    let match;
    while ((match = boldRegex.exec(innerText)) !== null) {
      allMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "bold",
        content: match[1],
      });
    }

    // Find italic matches (*text*) - but not if they're part of bold
    italicRegex.lastIndex = 0; // Reset regex
    while ((match = italicRegex.exec(innerText)) !== null) {
      // Check if this italic match is not part of a bold match
      const isPartOfBold = allMatches.some(
        (boldMatch) =>
          match.index >= boldMatch.start &&
          match.index + match[0].length <= boldMatch.end
      );

      if (!isPartOfBold) {
        allMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: "italic",
          content: match[1],
        });
      }
    }

    // Sort matches by start position
    allMatches.sort((a, b) => a.start - b.start);

    // Process text with formatting
    for (const formatMatch of allMatches) {
      // Add any text before this match
      if (currentIndex < formatMatch.start) {
        const plainText = innerText.substring(currentIndex, formatMatch.start);
        if (plainText) {
          elements.push({ type: "text", content: plainText });
        }
      }

      // Add the formatted element
      elements.push({ type: formatMatch.type, content: formatMatch.content });
      currentIndex = formatMatch.end;
    }

    // Add any remaining text
    if (currentIndex < innerText.length) {
      const remainingText = innerText.substring(currentIndex);
      if (remainingText) {
        elements.push({ type: "text", content: remainingText });
      }
    }

    // If no formatting was found, return the whole text as a single element
    if (elements.length === 0) {
      elements.push({ type: "text", content: innerText });
    }

    return elements;
  };

  const renderElement = (
    element: FormattedElement,
    index: number
  ): React.ReactNode => {
    switch (element.type) {
      case "text":
        return element.content;

      case "bold":
        return (
          <strong key={index} className="formatted-bold">
            {element.content}
          </strong>
        );

      case "italic":
        return (
          <em key={index} className="formatted-italic">
            {element.content}
          </em>
        );

      case "list":
        return (
          <ul key={index} className="formatted-list">
            {element.items?.map((item, itemIndex) => (
              <li key={itemIndex} className="formatted-list-item">
                <TextFormatter text={item} />
              </li>
            ))}
          </ul>
        );

      case "line-break":
        return <br key={index} />;

      default:
        return element.content;
    }
  };

  const elements = parseText(text);

  return (
    <div className={`text-formatter ${className}`}>
      {elements.map((element, index) => renderElement(element, index))}
    </div>
  );
};
