import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  return (
    <main>
      <h1>Turn-Based Grid Game v2</h1>
      <p>Core rules and API contracts are implemented in the backend first.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
