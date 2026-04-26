# Study Mate AI 🎓

An AI-powered study assistant built with React + Vite.

---

## ⚙️ Setup Instructions

### 1. Install Node.js
Download from https://nodejs.org (version 18 or higher)

### 2. Open this folder in your IDE (VS Code recommended)

### 3. Install dependencies
Open the terminal in your IDE and run:
```
npm install
```

### 4. Start the app
```
npm run dev
```

Then open your browser at: **http://localhost:5173**

---

## 🤖 API Key Setup

The app needs an AI API key to work. You have two options:

### Option A — Groq (FREE, recommended)
1. Go to https://console.groq.com
2. Sign up (no credit card needed)
3. Click API Keys → Create key
4. Copy the key (starts with `gsk_...`)
5. Open the app → Settings → AI Provider → select Groq → paste key → Test Connection

### Option B — Claude (Anthropic, paid)
1. Go to https://console.anthropic.com
2. Sign up → you get $5 free credits
3. Click API Keys → Create key
4. Copy the key (starts with `sk-ant-...`)
5. Open the app → Settings → AI Provider → select Claude → paste key → Test Connection

---

## 📁 Project Structure

```
study-mate-ai/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx       ← React entry point
│   └── App.jsx        ← Entire app (all components)
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## 🚀 Features

- 📋 Paste / Upload / OCR scan study material
- 🧠 AI Quiz, Flashcards, Summarize, Highlights
- 🌐 Translate into 27 languages with Read Aloud
- 🗺️ Mind Map generator
- 🎤 Viva Practice with AI scoring
- 📅 AI Exam Study Planner (day-by-day schedule)
- 👨‍🏫 AI Teacher (Beginner / School / Exam level)
- 🏆 XP system, badges, gamification
- ⏱️ Pomodoro timer
- 📓 Notes editor
- ▷ YouTube video suggestions
- ⚙️ Switch between Claude and Groq AI

---

## 🛠️ Build for production

```
npm run build
```

Output goes to the `dist/` folder. Deploy to Netlify, Vercel, or GitHub Pages.
