import { StoryGame } from "components/StoryGame";
import React from "react";

export const App: React.FC = () => (
  <>
    <div className="app-container">
      <div className="card">
        <h1 className="title">Story Quest</h1>
        <p className="subtitle">An AI-powered interactive text adventure</p>
        <StoryGame />
      </div>
    </div>
  </>
);
