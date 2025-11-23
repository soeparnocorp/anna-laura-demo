/**
 * Anna Laura AI Demo – Frontend Chat Script
 * Compatible with updated index.ts (Security + Persona + R2 Sessions)
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// ============ USER SESSION ID (for 24-hour memory) ============

let userId = localStorage.getItem("annalaura_demo_userid");

// If not exist → create unique ID
if (!userId) {
  userId = "user_" + Math.random().toString(36).substring(2) + Date.now();
  localStorage.setItem("annalaura_demo_userid", userId);
}

// ============ CHAT INITIAL MESSAGE ============

let chatHistory = [
  {
    role: "assistant",
    content:
      "Hello! I’m Anna Laura Demo — a friendly AI developed by SOEPARNO ENTERPRISE Corp. How can I help you today?",
  },
];

let isProcessing = false;

// ============ AUTO-RESIZE TEXTAREA ============
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Enter key send (Shift for newline)
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Send button handler
sendButton.addEventListener("click", sendMessage);

// =====================================================
//                 SEND MESSAGE FUNCTION
// =====================================================

async function sendMessage() {
  const message = userInput.value.trim();

  if (message === "" || isProcessing) return;

  isProcessing = true;
  userInput.disabled = true;
  sendButton.disabled = true;

  addMessageToChat("user", message);

  userInput.value = "";
  userInput.style.height = "auto";

  typingIndicator.classList.add("visible");

  chatHistory.push({ role: "user", content: message });

  try {
    // Create new assistant message bubble
    const assistantEl = document.createElement("div");
    assistantEl.className = "message assistant-message";
    assistantEl.innerHTML = "<p></p>";
    chatMessages.appendChild(assistantEl);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Send request to backend
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: chatHistory,
        userId: userId, // IMPORTANT — R2 session logic
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    // Streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            responseText += json.response;

            assistantEl.querySelector("p").textContent = responseText;
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } catch (err) {
          console.warn("Parse error:", err);
        }
      }
    }

    chatHistory.push({ role: "assistant", content: responseText });
  } catch (error) {
    console.error("Error:", error);
    addMessageToChat("assistant", "Oops… there was an error.");
  } finally {
    typingIndicator.classList.remove("visible");
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
}

// =====================================================
//               ADD MESSAGE TO UI
// =====================================================

function addMessageToChat(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}-message`;
  div.innerHTML = `<p>${content}</p>`;
  chatMessages.appendChild(div);

  chatMessages.scrollTop = chatMessages.scrollHeight;
}
