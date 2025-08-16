import { TextSummarizer } from "components/TextSummarizer";
import React from "react";

export const App: React.FC = () => (
  <>
    <div className="app-container">
      <div className="card">
        <h1 className="summary-title">Text Summary</h1>
        <TextSummarizer />
      </div>
    </div>
  </>
);
